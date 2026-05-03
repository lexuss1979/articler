import { emitEvent } from '../events/bus';
import { getSession } from '../sessions/repo';
import { getProfile } from '../profiles/repo';
import { planSchema } from '../sessions/plan';
import { listSectionDrafts } from '../sessions/section-drafts-repo';
import { BUILTIN_CRITICS, parseActiveCritics } from '../sessions/critics';
import { createCritiqueRound, insertFinding } from '../sessions/critique-repo';
import { spanHash } from '../sessions/claims';
import { runCritic } from './stages/run-critic';

export const GENERIC_CRITIC_SYSTEM_PROMPT = `You are a thoughtful article critic. Read the sections below and identify issues that could be improved.
Respond ONLY with valid JSON of shape { findings: [...] }, no prose, no fences.`;

export async function runReview({
  sessionId,
  userId,
}: {
  sessionId: number;
  userId: number;
}): Promise<
  | { ok: true; roundId: number; findingCount: number }
  | { ok: false; error: 'session_invalid' | 'no_draft' }
> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  const planParsed = planSchema.safeParse(session.plan);
  if (!planParsed.success) return { ok: false, error: 'session_invalid' };
  const plan = planParsed.data;

  const profile = await getProfile(userId, session.profileId);
  if (!profile) return { ok: false, error: 'session_invalid' };

  if (!session.draftMd) return { ok: false, error: 'no_draft' };

  const activeCritics = parseActiveCritics(session.activeCritics);

  const critics = [
    ...BUILTIN_CRITICS.filter((c) => activeCritics.enabledIds.includes(c.id)),
    ...activeCritics.custom.map((c) => ({
      id: c.id,
      label: c.label,
      systemPrompt: GENERIC_CRITIC_SYSTEM_PROMPT + '\n' + c.promptFragment,
      defaultEnabled: true as const,
    })),
  ];

  const round = await createCritiqueRound(userId, sessionId, 'critique', spanHash(session.draftMd));
  if (!round) return { ok: false, error: 'session_invalid' };

  const sectionDrafts = await listSectionDrafts(userId, sessionId);

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () => Promise.reject(new Error('userInput not available in review context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const results = await Promise.all(
    critics.map((critic) =>
      runCritic.run({ critic, plan, profile, sectionDrafts }, ctx),
    ),
  );

  let findingCount = 0;
  for (const { findings } of results) {
    for (const finding of findings) {
      const row = await insertFinding(userId, round.id, finding);
      if (row) {
        findingCount++;
        await emitEvent(sessionId, 'artifact_updated', { kind: 'finding', finding: row });
      }
    }
  }

  await emitEvent(sessionId, 'artifact_updated', {
    kind: 'critique_round',
    roundId: round.id,
    findingCount,
  });

  return { ok: true, roundId: round.id, findingCount };
}

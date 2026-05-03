import { emitEvent } from '../events/bus';
import { getSession } from '../sessions/repo';
import { getProfile } from '../profiles/repo';
import { planSchema } from '../sessions/plan';
import { listSectionDrafts } from '../sessions/section-drafts-repo';
import { spanHash } from '../sessions/claims';
import { appendDecorationRound } from '../sessions/decoration-repo';
import { proposeDecoration } from './stages/propose-decoration';

export async function runDecoration({
  sessionId,
  userId,
}: {
  sessionId: number;
  userId: number;
}): Promise<
  | { ok: true; roundId: string; suggestionCount: number }
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

  const draftHash = spanHash(session.draftMd);
  const sectionDrafts = await listSectionDrafts(userId, sessionId);

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () => Promise.reject(new Error('userInput not available in decoration context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const result = await proposeDecoration.run({ profile, plan, sectionDrafts }, ctx);

  const round = await appendDecorationRound(userId, sessionId, {
    draftHash,
    suggestions: result.suggestions,
  });
  if (!round) return { ok: false, error: 'session_invalid' };

  for (const suggestion of round.suggestions) {
    await emitEvent(sessionId, 'artifact_updated', {
      kind: 'decoration_suggestion',
      suggestion,
    });
  }

  const suggestionCount = round.suggestions.length;
  await emitEvent(sessionId, 'artifact_updated', {
    kind: 'decoration_round',
    roundId: round.id,
    suggestionCount,
  });

  return { ok: true, roundId: round.id, suggestionCount };
}

import { emitEvent } from '../events/bus';
import { getSession } from '../sessions/repo';
import { getProfile } from '../profiles/repo';
import { planSchema } from '../sessions/plan';
import { listSectionDrafts } from '../sessions/section-drafts-repo';
import { setImageSlots } from '../sessions/images-repo';
import type { ImageSlot } from '../sessions/images';
import { proposeImageSlots } from './stages/propose-image-slots';
import { withStageCtx } from './with-stage-ctx';

export async function runIllustration({
  sessionId,
  userId,
}: {
  sessionId: number;
  userId: number;
}): Promise<
  { ok: true; slotCount: number } | { ok: false; error: 'session_invalid' | 'no_draft' }
> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  const planParsed = planSchema.safeParse(session.plan);
  if (!planParsed.success) return { ok: false, error: 'session_invalid' };
  const plan = planParsed.data;

  const profile = await getProfile(userId, session.profileId);
  if (!profile) return { ok: false, error: 'session_invalid' };

  if (!session.draftMd) return { ok: false, error: 'no_draft' };

  const sectionDrafts = await listSectionDrafts(userId, sessionId);

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () =>
      Promise.reject(new Error('userInput not available in illustration context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const result = await withStageCtx(proposeImageSlots, sessionId, userId, () =>
    proposeImageSlots.run({ profile, plan, sectionDrafts }, ctx),
  );

  const now = Date.now();
  const slots: ImageSlot[] = [
    {
      id: 's_hero_' + now,
      kind: 'hero',
      brief: result.heroBrief,
      mode: 'undecided',
      candidates: [],
    },
    ...result.inlineSlots.map((inline, i) => ({
      id: 's_in_' + now + '_' + i,
      kind: 'inline' as const,
      sectionId: inline.sectionId,
      paragraphIndex: inline.paragraphIndex,
      brief: inline.brief,
      mode: 'undecided' as const,
      candidates: [],
    })),
  ];

  const persisted = await setImageSlots(userId, sessionId, slots);
  if (!persisted) return { ok: false, error: 'session_invalid' };

  for (const slot of persisted) {
    await emitEvent(sessionId, 'artifact_updated', { kind: 'image_slot', slot });
  }

  await emitEvent(sessionId, 'artifact_updated', {
    kind: 'image_slots_round',
    slotCount: persisted.length,
  });

  return { ok: true, slotCount: persisted.length };
}

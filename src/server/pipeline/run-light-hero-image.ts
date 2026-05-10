import { emitEvent } from '../events/bus';
import { getSession } from '../sessions/repo';
import { updateSessionDraft } from '../sessions/repo';
import { getProfile } from '../profiles/repo';
import { planSchema } from '../sessions/plan';
import { parseImageState, renderImageMarkdown } from '../sessions/images';
import { setImageSlots } from '../sessions/images-repo';
import { BudgetExceededError } from '../llm/budget-guard';
import { composeImagePrompt } from './stages/compose-image-prompt';
import { prerenderImages } from './stages/prerender-images';
import { withStageCtx } from './with-stage-ctx';

export async function runLightHeroImage({
  sessionId,
  userId,
}: {
  sessionId: number;
  userId: number;
}): Promise<
  | { ok: true; candidateId: string; localPath: string }
  | {
      ok: false;
      error:
        | 'session_invalid'
        | 'no_plan'
        | 'no_draft'
        | 'already_generated'
        | 'budget_exceeded'
        | 'image_failed';
    }
> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  const planParsed = planSchema.safeParse(session.plan);
  if (!planParsed.success) return { ok: false, error: 'no_plan' };
  const plan = planParsed.data;

  if (!session.draftMd || session.draftMd.length === 0) return { ok: false, error: 'no_draft' };

  const imageState = parseImageState(session.images);
  if (imageState.slots.some((s) => s.kind === 'hero' && s.chosenCandidateId)) {
    return { ok: false, error: 'already_generated' };
  }

  const profile = await getProfile(userId, session.profileId);
  if (!profile) return { ok: false, error: 'session_invalid' };

  const slotId = 's_hero_' + sessionId + '_' + Date.now();
  const slot = {
    id: slotId,
    kind: 'hero' as const,
    brief: ('Hero image for: ' + plan.thesis + ' — target takeaway: ' + plan.targetTakeaway).slice(
      0,
      990,
    ),
  };

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () =>
      Promise.reject(new Error('userInput not available in hero image context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  let prompt: Awaited<ReturnType<typeof composeImagePrompt.run>>;
  try {
    prompt = await withStageCtx(composeImagePrompt, sessionId, userId, () =>
      composeImagePrompt.run({ profile, plan, slot, surroundingMd: session.draftMd!.slice(0, 500) }, ctx),
    );
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await emitEvent(sessionId, 'artifact_updated', { kind: 'hero_image_failed', reason: 'budget_exceeded' });
      return { ok: false, error: 'budget_exceeded' };
    }
    await emitEvent(sessionId, 'artifact_updated', { kind: 'hero_image_failed', reason: 'compose_failed' });
    return { ok: false, error: 'image_failed' };
  }

  let renderResult: Awaited<ReturnType<typeof prerenderImages.run>>;
  try {
    renderResult = await withStageCtx(prerenderImages, sessionId, userId, () =>
      prerenderImages.run({ sessionId, slotId, prompt, count: 1 }, ctx),
    );
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await emitEvent(sessionId, 'artifact_updated', { kind: 'hero_image_failed', reason: 'budget_exceeded' });
      return { ok: false, error: 'budget_exceeded' };
    }
    await emitEvent(sessionId, 'artifact_updated', { kind: 'hero_image_failed', reason: 'render_failed' });
    return { ok: false, error: 'image_failed' };
  }

  const candidate = renderResult.candidates[0]!;
  const altText = plan.thesis.slice(0, 200);

  const persisted = await setImageSlots(userId, sessionId, [
    {
      ...slot,
      altText,
      mode: 'generate',
      prompt,
      candidates: [candidate],
      chosenCandidateId: candidate.id,
    },
  ]);
  if (!persisted) return { ok: false, error: 'session_invalid' };

  const heroMd = renderImageMarkdown(candidate, altText);
  const currentDraft = session.draftMd ?? '';
  if (!currentDraft.startsWith(heroMd)) {
    await updateSessionDraft(userId, sessionId, heroMd + '\n\n' + currentDraft);
  }

  await emitEvent(sessionId, 'artifact_updated', {
    kind: 'hero_image',
    url: candidate.localPath,
    candidateId: candidate.id,
  });

  return { ok: true, candidateId: candidate.id, localPath: candidate.localPath };
}

import { getSession, updateSessionDraft } from '../sessions/repo';
import { planSchema, type Plan } from '../sessions/plan';
import { insertParagraph } from '../sessions/decoration';
import { renderImageMarkdown, type ImageState } from '../sessions/images';
import { findSlot, getImageState, setSlotChoice } from '../sessions/images-repo';
import {
  getSectionDraft,
  listSectionDrafts,
  upsertSectionDraft,
} from '../sessions/section-drafts-repo';

type ApplyImageResult =
  | { ok: true; revisedDraftMd: string }
  | {
      ok: false;
      error: 'not_found' | 'session_invalid' | 'plan_invalid' | 'section_missing';
    };

function planIndexFor(plan: Plan, sectionId: string): number {
  const idx = plan.sections.findIndex((s) => s.id === sectionId);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

async function composeDraftMd(
  userId: number,
  sessionId: number,
  plan: Plan,
  imageState: ImageState,
): Promise<string> {
  const allDrafts = await listSectionDrafts(userId, sessionId);
  const ordered = [...allDrafts].sort(
    (a, b) => planIndexFor(plan, a.sectionId) - planIndexFor(plan, b.sectionId),
  );
  const body = ordered.map((r) => r.contentMd).join('\n\n');

  const heroSlot = imageState.slots.find(
    (s) => s.kind === 'hero' && s.chosenCandidateId,
  );
  if (!heroSlot) return body;
  const heroCandidate = heroSlot.candidates.find(
    (c) => c.id === heroSlot.chosenCandidateId,
  );
  if (!heroCandidate) return body;

  const heroMd = renderImageMarkdown(heroCandidate, heroSlot.altText ?? '');
  return body.length > 0 ? `${heroMd}\n\n${body}` : heroMd;
}

export async function applyImageSelection({
  sessionId,
  userId,
  slotId,
  candidateId,
}: {
  sessionId: number;
  userId: number;
  slotId: string;
  candidateId: string;
}): Promise<ApplyImageResult> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  const planParsed = planSchema.safeParse(session.plan);
  if (!planParsed.success) return { ok: false, error: 'plan_invalid' };
  const plan = planParsed.data;

  const slot = await findSlot(userId, sessionId, slotId);
  if (!slot) return { ok: false, error: 'not_found' };

  const candidate = slot.candidates.find((c) => c.id === candidateId);
  if (!candidate) return { ok: false, error: 'not_found' };

  const previousCandidate = slot.chosenCandidateId
    ? slot.candidates.find((c) => c.id === slot.chosenCandidateId)
    : null;
  const sameAsBefore = slot.chosenCandidateId === candidateId;

  if (slot.kind === 'inline' && !sameAsBefore) {
    if (!slot.sectionId || slot.paragraphIndex === undefined) {
      return { ok: false, error: 'section_missing' };
    }
    const sectionRow = await getSectionDraft(userId, sessionId, slot.sectionId);
    if (!sectionRow) return { ok: false, error: 'section_missing' };
    const newInlineMd = renderImageMarkdown(candidate, slot.altText ?? '');

    let nextContentMd: string;
    if (previousCandidate) {
      const oldInlineMd = renderImageMarkdown(previousCandidate, slot.altText ?? '');
      nextContentMd = sectionRow.contentMd.includes(oldInlineMd)
        ? sectionRow.contentMd.replace(oldInlineMd, newInlineMd)
        : insertParagraph(sectionRow.contentMd, slot.paragraphIndex, newInlineMd);
    } else {
      nextContentMd = insertParagraph(
        sectionRow.contentMd,
        slot.paragraphIndex,
        newInlineMd,
      );
    }
    await upsertSectionDraft(userId, sessionId, slot.sectionId, nextContentMd);
  }

  if (!sameAsBefore) {
    await setSlotChoice(userId, sessionId, slotId, candidateId);
  }
  const freshImageState = await getImageState(userId, sessionId);
  const revisedDraftMd = await composeDraftMd(userId, sessionId, plan, freshImageState);
  await updateSessionDraft(userId, sessionId, revisedDraftMd);

  return { ok: true, revisedDraftMd };
}

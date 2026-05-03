import { getSession, updateSessionDraft } from '../sessions/repo';
import { planSchema, type Plan } from '../sessions/plan';
import { insertParagraph } from '../sessions/decoration';
import { renderImageMarkdown } from '../sessions/images';
import { findSlot, setSlotChoice } from '../sessions/images-repo';
import {
  getSectionDraft,
  listSectionDrafts,
  upsertSectionDraft,
} from '../sessions/section-drafts-repo';

type ApplyImageResult =
  | { ok: true; revisedDraftMd: string }
  | {
      ok: false;
      error:
        | 'not_found'
        | 'session_invalid'
        | 'plan_invalid'
        | 'section_missing'
        | 'already_chosen';
    };

function planIndexFor(plan: Plan, sectionId: string): number {
  const idx = plan.sections.findIndex((s) => s.id === sectionId);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

async function composeFromSectionDrafts(
  userId: number,
  sessionId: number,
  plan: Plan,
): Promise<string> {
  const allDrafts = await listSectionDrafts(userId, sessionId);
  const ordered = [...allDrafts].sort(
    (a, b) => planIndexFor(plan, a.sectionId) - planIndexFor(plan, b.sectionId),
  );
  return ordered.map((r) => r.contentMd).join('\n\n');
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

  if (slot.chosenCandidateId) {
    return { ok: false, error: 'already_chosen' };
  }

  const candidate = slot.candidates.find((c) => c.id === candidateId);
  if (!candidate) return { ok: false, error: 'not_found' };

  const imageMd = renderImageMarkdown(candidate, slot.altText ?? '');

  let revisedDraftMd: string;
  if (slot.kind === 'inline') {
    if (!slot.sectionId || slot.paragraphIndex === undefined) {
      return { ok: false, error: 'section_missing' };
    }
    const sectionRow = await getSectionDraft(userId, sessionId, slot.sectionId);
    if (!sectionRow) return { ok: false, error: 'section_missing' };
    const nextContentMd = insertParagraph(
      sectionRow.contentMd,
      slot.paragraphIndex,
      imageMd,
    );
    await upsertSectionDraft(userId, sessionId, slot.sectionId, nextContentMd);
    revisedDraftMd = await composeFromSectionDrafts(userId, sessionId, plan);
  } else {
    const composed = await composeFromSectionDrafts(userId, sessionId, plan);
    revisedDraftMd = composed.length > 0 ? `${imageMd}\n\n${composed}` : imageMd;
  }

  await updateSessionDraft(userId, sessionId, revisedDraftMd);
  await setSlotChoice(userId, sessionId, slotId, candidateId);

  return { ok: true, revisedDraftMd };
}

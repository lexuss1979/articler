import { getSession, updateSessionDraft } from '../sessions/repo';
import { planSchema } from '../sessions/plan';
import { insertParagraph } from '../sessions/decoration';
import { findSuggestion, setSuggestionStatus } from '../sessions/decoration-repo';
import {
  getSectionDraft,
  listSectionDrafts,
  upsertSectionDraft,
} from '../sessions/section-drafts-repo';

type ApplyResult =
  | { ok: true; revisedDraftMd: string }
  | { ok: false; error: 'not_found' | 'session_invalid' | 'plan_invalid' | 'section_missing' };

export async function applyDecoration({
  sessionId,
  userId,
  suggestionId,
}: {
  sessionId: number;
  userId: number;
  suggestionId: string;
}): Promise<ApplyResult> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  const planParsed = planSchema.safeParse(session.plan);
  if (!planParsed.success) return { ok: false, error: 'plan_invalid' };
  const plan = planParsed.data;

  const found = await findSuggestion(userId, sessionId, suggestionId);
  if (!found) return { ok: false, error: 'not_found' };
  const { suggestion } = found;

  const sectionRow = await getSectionDraft(userId, sessionId, suggestion.sectionId);
  if (!sectionRow) return { ok: false, error: 'section_missing' };

  const nextContentMd = insertParagraph(
    sectionRow.contentMd,
    suggestion.paragraphIndex,
    suggestion.contentMd,
  );
  await upsertSectionDraft(userId, sessionId, suggestion.sectionId, nextContentMd);

  const allDrafts = await listSectionDrafts(userId, sessionId);
  const planIndex = (sectionId: string) => {
    const idx = plan.sections.findIndex((s) => s.id === sectionId);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  const ordered = [...allDrafts].sort(
    (a, b) => planIndex(a.sectionId) - planIndex(b.sectionId),
  );
  const revisedDraftMd = ordered.map((r) => r.contentMd).join('\n\n');

  await updateSessionDraft(userId, sessionId, revisedDraftMd);
  await setSuggestionStatus(userId, sessionId, suggestionId, 'accepted');

  return { ok: true, revisedDraftMd };
}

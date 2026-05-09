import { emitEvent } from '../events/bus';
import { briefSchema } from '../sessions/brief';
import { planSchema } from '../sessions/plan';
import { getSession } from '../sessions/repo';
import { updateSessionDraft } from '../sessions/repo';
import { getProfile } from '../profiles/repo';
import { listSessionSources } from '../sessions/sources-repo';
import { listSectionDrafts, upsertSectionDraft } from '../sessions/section-drafts-repo';
import { draftSection } from './stages/draft-section';
import { withStageCtx } from './with-stage-ctx';

export async function regenerateSection({
  sessionId,
  userId,
  sectionId,
  instruction,
}: {
  sessionId: number;
  userId: number;
  sectionId: string;
  instruction?: string;
}): Promise<
  { ok: true; contentMd: string } | { ok: false; error: 'session_invalid' | 'section_not_found' }
> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  const planParsed = planSchema.safeParse(session.plan);
  if (!planParsed.success) return { ok: false, error: 'session_invalid' };
  const plan = planParsed.data;

  const briefParsed = briefSchema.safeParse(session.brief);
  if (!briefParsed.success) return { ok: false, error: 'session_invalid' };
  const brief = briefParsed.data;

  const profile = await getProfile(userId, session.profileId);
  if (!profile) return { ok: false, error: 'session_invalid' };

  const section = plan.sections.find((s) => s.id === sectionId);
  if (!section) return { ok: false, error: 'section_not_found' };

  const allSources = await listSessionSources(userId, sessionId);
  const acceptedSources = allSources.filter((s) => s.status === 'accepted' && s.sectionId === sectionId);

  const existingDrafts = await listSectionDrafts(userId, sessionId);
  const sectionIndex = plan.sections.findIndex((s) => s.id === sectionId);
  const prevSectionIds = new Set(plan.sections.slice(0, sectionIndex).map((s) => s.id));
  const prevSections = existingDrafts
    .filter((d) => prevSectionIds.has(d.sectionId))
    .sort((a, b) => {
      const ai = plan.sections.findIndex((s) => s.id === a.sectionId);
      const bi = plan.sections.findIndex((s) => s.id === b.sectionId);
      return ai - bi;
    })
    .map((d) => ({ id: d.sectionId, contentMd: d.contentMd }));

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () => Promise.reject(new Error('userInput not available in regenerate context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const { contentMd } = await withStageCtx(draftSection, sessionId, userId, () =>
    draftSection.run(
      {
        profile,
        plan,
        section,
        acceptedSources: acceptedSources.map((s) => ({
          url: s.url,
          title: s.title,
          summary: s.summary,
          rawExcerpt: s.rawExcerpt,
        })),
        prevSections,
        instruction: instruction || undefined,
        rewriteSourceArticles: session.mode === 'rewrite' ? brief.sourceArticles : undefined,
      },
      ctx,
    ),
  );

  await upsertSectionDraft(userId, sessionId, sectionId, contentMd);

  const draftMap = new Map(existingDrafts.map((d) => [d.sectionId, d.contentMd]));
  draftMap.set(sectionId, contentMd);
  const draftMd = plan.sections
    .map((s) => draftMap.get(s.id))
    .filter((md): md is string => md !== undefined)
    .join('\n\n');
  await updateSessionDraft(userId, sessionId, draftMd);

  await emitEvent(sessionId, 'artifact_updated', { kind: 'section_draft', sectionId, contentMd });

  return { ok: true, contentMd };
}

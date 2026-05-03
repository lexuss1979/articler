import { notFound } from 'next/navigation';
import { requireUser } from '../../../../server/auth/require-user';
import { getSession } from '../../../../server/sessions/repo';
import { listSessionSources } from '../../../../server/sessions/sources-repo';
import { listSectionDrafts } from '../../../../server/sessions/section-drafts-repo';
import { planSchema } from '../../../../server/sessions/plan';
import { parseActiveCritics } from '../../../../server/sessions/critics';
import { parseDecorationState } from '../../../../server/sessions/decoration';
import { parseImageState } from '../../../../server/sessions/images';
import { listSessionRounds, listRoundFindings } from '../../../../server/sessions/critique-repo';
import { listSessionClaimsWithVerdicts } from '../../../../server/sessions/claims-repo';
import { getProfile } from '../../../../server/profiles/repo';
import { parseMarkupRules } from '../../../../server/profiles/markup';
import { renderMarkdownArticle } from '../../../../server/export/markdown';
import { renderHtmlArticle } from '../../../../server/export/html';
import { BriefForm } from './brief-form';
import { ChatPane } from './chat-pane';
import { PlanningPane } from './planning-pane';
import { ResearchPane } from './research-pane';
import { DraftingPane } from './drafting-pane';
import { ReviewPane } from './review-pane';
import { DecorationPane } from './decoration-pane';
import { IllustrationPane } from './illustration-pane';
import { ExportPane } from './export-pane';
import { DevResetPanel } from './dev-reset-panel';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: idStr } = await params;
  const id = Number(idStr);

  const session = await getSession(user.id, id);
  if (!session) notFound();

  let researchSources = null;
  let researchPlan = null;
  if (session.state === 'research') {
    researchSources = await listSessionSources(user.id, id);
    const parsed = planSchema.safeParse(session.plan);
    researchPlan = parsed.success ? parsed.data : null;
  }

  let draftingPlan = null;
  let initialSectionDrafts = null;
  if (session.state === 'drafting') {
    const parsed = planSchema.safeParse(session.plan);
    draftingPlan = parsed.success ? parsed.data : null;
    if (draftingPlan) {
      initialSectionDrafts = await listSectionDrafts(user.id, id);
    }
  }

  let decorationData = null;
  if (session.state === 'decoration') {
    const parsed = planSchema.safeParse(session.plan);
    if (parsed.success) {
      const decorationState = parseDecorationState(session.decoration);
      const sectionDrafts = await listSectionDrafts(user.id, id);
      decorationData = {
        plan: parsed.data,
        decorationState,
        sectionDrafts: sectionDrafts.map((s) => ({
          sectionId: s.sectionId,
          contentMd: s.contentMd,
        })),
      };
    }
  }

  let exportPreviewHtml: string | null = null;
  if (session.state === 'export' || session.state === 'done') {
    const profile = await getProfile(user.id, session.profileId);
    if (profile) {
      const rules = parseMarkupRules(profile.markupRules);
      const imageState = parseImageState(session.images);
      const { contentMd } = await renderMarkdownArticle({
        session: { id: session.id, draftMd: session.draftMd },
        imageState,
      });
      exportPreviewHtml = await renderHtmlArticle(contentMd, rules);
    }
  }

  let illustrationData = null;
  if (session.state === 'illustration') {
    const parsed = planSchema.safeParse(session.plan);
    if (parsed.success) {
      illustrationData = {
        plan: parsed.data,
        imageState: parseImageState(session.images),
      };
    }
  }

  let reviewData = null;
  if (session.state === 'review') {
    const [critiqueRoundsRaw, factCheckRounds, claimsWithVerdicts] = await Promise.all([
      listSessionRounds(user.id, id, 'critique'),
      listSessionRounds(user.id, id, 'factcheck'),
      listSessionClaimsWithVerdicts(user.id, id),
    ]);
    const critiqueRounds = await Promise.all(
      critiqueRoundsRaw.map(async (r) => ({
        ...r,
        findings: await listRoundFindings(user.id, r.id),
      })),
    );
    reviewData = {
      critiqueRounds,
      factCheckRounds,
      claimsWithVerdicts,
      activeCriticIds: parseActiveCritics(session.activeCritics).enabledIds,
    };
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 min-h-0 border rounded flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b">
          <h2 className="text-sm font-medium text-gray-500">Workbench</h2>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <DevResetPanel sessionId={id} currentState={session.state} />
        )}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {session.state === 'briefing' ? (
            <BriefForm sessionId={id} isRewrite={session.mode === 'rewrite'} />
          ) : session.state === 'planning' ? (
            <PlanningPane sessionId={id} initialPlan={session.plan} />
          ) : session.state === 'research' && researchPlan ? (
            <ResearchPane sessionId={id} initialSources={researchSources ?? []} plan={researchPlan} />
          ) : session.state === 'drafting' && draftingPlan ? (
            <DraftingPane sessionId={id} plan={draftingPlan} initialSections={initialSectionDrafts ?? []} />
          ) : session.state === 'review' && reviewData ? (
            <ReviewPane
              sessionId={id}
              initialCritiqueRounds={reviewData.critiqueRounds}
              initialFactCheckRounds={reviewData.factCheckRounds}
              initialClaims={reviewData.claimsWithVerdicts}
              activeCriticIds={reviewData.activeCriticIds}
              draftMd={session.draftMd ?? ''}
              revisedDraftMd={session.revisedDraftMd}
              revisionStatus={session.revisionStatus}
            />
          ) : session.state === 'decoration' && decorationData ? (
            <DecorationPane
              sessionId={id}
              plan={decorationData.plan}
              initialState={decorationData.decorationState}
              sectionDrafts={decorationData.sectionDrafts}
            />
          ) : session.state === 'illustration' && illustrationData ? (
            <IllustrationPane
              sessionId={id}
              plan={illustrationData.plan}
              initialState={illustrationData.imageState}
            />
          ) : session.state === 'export' || session.state === 'done' ? (
            <ExportPane
              sessionId={id}
              state={session.state}
              previewHtml={exportPreviewHtml}
            />
          ) : (
            <p className="text-sm text-gray-500">State: {session.state}</p>
          )}
        </div>
      </div>
      <div className="w-72 shrink-0 flex flex-col border rounded overflow-hidden">
        <ChatPane sessionId={id} />
      </div>
    </div>
  );
}

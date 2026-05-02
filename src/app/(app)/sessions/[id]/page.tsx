import { notFound } from 'next/navigation';
import { requireUser } from '../../../../server/auth/require-user';
import { getSession } from '../../../../server/sessions/repo';
import { listSessionSources } from '../../../../server/sessions/sources-repo';
import { listSectionDrafts } from '../../../../server/sessions/section-drafts-repo';
import { planSchema } from '../../../../server/sessions/plan';
import { BriefForm } from './brief-form';
import { ChatPane } from './chat-pane';
import { PlanningPane } from './planning-pane';
import { ResearchPane } from './research-pane';
import { DraftingPane } from './drafting-pane';
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

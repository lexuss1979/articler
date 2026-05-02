import { notFound } from 'next/navigation';
import { requireUser } from '../../../../server/auth/require-user';
import { getSession } from '../../../../server/sessions/repo';
import { listSessionSources } from '../../../../server/sessions/sources-repo';
import { planSchema } from '../../../../server/sessions/plan';
import { BriefForm } from './brief-form';
import { ChatPane } from './chat-pane';
import { PlanningPane } from './planning-pane';
import { ResearchPane } from './research-pane';

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

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 border rounded p-4 overflow-y-auto">
        <h2 className="text-sm font-medium text-gray-500 mb-4">Workbench</h2>
        {session.state === 'briefing' ? (
          <BriefForm sessionId={id} isRewrite={session.mode === 'rewrite'} />
        ) : session.state === 'planning' ? (
          <PlanningPane sessionId={id} initialPlan={session.plan} />
        ) : session.state === 'research' && researchPlan ? (
          <ResearchPane sessionId={id} initialSources={researchSources ?? []} plan={researchPlan} />
        ) : (
          <p className="text-sm text-gray-500">State: {session.state}</p>
        )}
      </div>
      <div className="w-80 flex flex-col border rounded">
        <ChatPane sessionId={id} />
      </div>
    </div>
  );
}

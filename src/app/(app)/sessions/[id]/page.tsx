import { notFound } from 'next/navigation';
import { requireUser } from '../../../../server/auth/require-user';
import { getSession } from '../../../../server/sessions/repo';
import { BriefForm } from './brief-form';
import { ChatPane } from './chat-pane';

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

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 border rounded p-4 overflow-y-auto">
        <h2 className="text-sm font-medium text-gray-500 mb-4">Workbench</h2>
        {session.state === 'briefing' ? (
          <BriefForm sessionId={id} isRewrite={session.mode === 'rewrite'} />
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

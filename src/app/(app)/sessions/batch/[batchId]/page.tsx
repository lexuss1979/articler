import { notFound } from 'next/navigation';
import { requireUser } from '../../../../../server/auth/require-user';
import { getBatchWithSessions } from '../../../../../server/batches/repo';
import { BatchCards } from './batch-cards';

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const user = await requireUser();
  const { batchId: batchIdStr } = await params;
  const batchId = Number(batchIdStr);

  const result = await getBatchWithSessions(user.id, batchId);
  if (!result) notFound();

  const initialSessions = result.sessions.map((s) => {
    const brief = s.brief as { topic?: string } | null;
    return {
      id: s.id,
      topic: brief?.topic ?? '',
      state: s.state,
      draftMd: s.draftMd,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Batch #{batchId}</h1>
      <BatchCards batchId={batchId} initialSessions={initialSessions} />
    </main>
  );
}

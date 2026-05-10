import { requireUser } from '../../../../../server/auth/require-user';
import { listProfiles } from '../../../../../server/profiles/repo';
import { BatchForm } from './batch-form';

export default async function BatchNewPage() {
  const user = await requireUser();
  const profiles = await listProfiles(user.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">New batch</h1>
      <BatchForm profiles={profiles.map((p) => ({ id: p.id, name: p.name }))} />
    </main>
  );
}

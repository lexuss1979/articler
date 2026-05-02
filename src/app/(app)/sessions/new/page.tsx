import { requireUser } from '../../../../server/auth/require-user';
import { listProfiles } from '../../../../server/profiles/repo';
import { NewSessionForm } from './new-session-form';

export default async function NewSessionPage() {
  const user = await requireUser();
  const profiles = await listProfiles(user.id);

  return <NewSessionForm profiles={profiles.map((p) => ({ id: p.id, name: p.name }))} />;
}

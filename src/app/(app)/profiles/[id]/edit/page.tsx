import { notFound } from 'next/navigation';
import { requireUser } from '../../../../../server/auth/require-user';
import { listAssertions } from '../../../../../server/profiles/profile-assertions-repo';
import { getProfile } from '../../../../../server/profiles/repo';
import { AssertionsPanel } from './assertions-panel';
import { EditForm } from './edit-form';
import { ExamplesForm } from './examples-form';

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const profileId = Number(id);
  const profile = await getProfile(user.id, profileId);

  if (!profile) notFound();

  const assertions = await listAssertions(profileId);

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Edit profile</h1>
      <EditForm profile={profile} />
      <AssertionsPanel profileId={profileId} assertions={assertions} />
      <ExamplesForm profileId={profileId} />
    </div>
  );
}

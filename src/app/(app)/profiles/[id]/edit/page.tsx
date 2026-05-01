import { notFound } from 'next/navigation';
import { requireUser } from '../../../../../server/auth/require-user';
import { getProfile } from '../../../../../server/profiles/repo';
import { EditForm } from './edit-form';

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const profile = await getProfile(user.id, Number(id));

  if (!profile) notFound();

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Edit profile</h1>
      <EditForm profile={profile} />
    </div>
  );
}

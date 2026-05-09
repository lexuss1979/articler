import Link from 'next/link';
import { requireUser } from '../../../server/auth/require-user';
import { listProfiles } from '../../../server/profiles/repo';
import { DeleteButton } from './delete-button';

export default async function ProfilesPage() {
  const user = await requireUser();
  const profiles = await listProfiles(user.id);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto h-full overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profiles</h1>
        <Link
          href="/profiles/new"
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          + New profile
        </Link>
      </div>
      {profiles.length === 0 ? (
        <p className="text-gray-500 text-sm">No profiles yet.</p>
      ) : (
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Format</th>
              <th className="pb-2 font-medium">Volume range</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id} className="border-b">
                <td className="py-2">{profile.name}</td>
                <td className="py-2">{profile.format}</td>
                <td className="py-2">
                  {profile.targetVolumeMin}–{profile.targetVolumeMax}
                </td>
                <td className="py-2 flex gap-3">
                  <Link
                    href={`/profiles/${profile.id}/edit`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Edit
                  </Link>
                  <DeleteButton id={profile.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

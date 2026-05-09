'use client';

import { useActionState } from 'react';
import { type SessionActionState, createSessionAction } from '../actions';

export function NewSessionForm({ profiles }: { profiles: { id: number; name: string }[] }) {
  const [state, dispatch] = useActionState<SessionActionState, FormData>(
    createSessionAction,
    null,
  );

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <h1 className="text-2xl font-semibold">New session</h1>
      {state && !state.ok && state.error === 'profile_not_owned' && (
        <div className="text-red-600 text-sm border border-red-200 rounded p-3">
          You do not own the selected profile.
        </div>
      )}
      {state && !state.ok && state.error === 'validation' && (
        <div className="text-red-600 text-sm border border-red-200 rounded p-3">
          Invalid input — please check your selections.
        </div>
      )}
      <form action={dispatch} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Profile</span>
          <select name="profileId" required className="border rounded px-3 py-1.5 text-sm">
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Mode</span>
          <select name="mode" required className="border rounded px-3 py-1.5 text-sm">
            <option value="new">New article</option>
            <option value="rewrite">Rewrite</option>
            <option value="light">Light mode (auto-pilot)</option>
          </select>
        </label>
        <button
          type="submit"
          className="self-start bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          Create session
        </button>
      </form>
    </div>
  );
}

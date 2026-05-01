'use client';

import { useActionState } from 'react';
import { PROFILE_FORMATS } from '../../../../server/profiles/schema';
import { type ProfileActionState, createProfileAction } from '../actions';

export default function NewProfilePage() {
  const [state, dispatch] = useActionState<ProfileActionState, FormData>(createProfileAction, null);

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <h1 className="text-2xl font-semibold">New profile</h1>
      {state && !state.ok && (
        <div className="text-red-600 text-sm border border-red-200 rounded p-3">
          Validation error: please check your inputs.
        </div>
      )}
      <form action={dispatch} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <input name="name" type="text" required className="border rounded px-3 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Format</span>
          <select name="format" required className="border rounded px-3 py-1.5 text-sm">
            {PROFILE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Style</span>
          <input name="style" type="text" required className="border rounded px-3 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Audience</span>
          <input
            name="audience"
            type="text"
            required
            className="border rounded px-3 py-1.5 text-sm"
          />
        </label>
        <div className="flex gap-4">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-sm font-medium">Min words</span>
            <input
              name="targetVolumeMin"
              type="number"
              min={1}
              required
              className="border rounded px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-sm font-medium">Max words</span>
            <input
              name="targetVolumeMax"
              type="number"
              min={1}
              required
              className="border rounded px-3 py-1.5 text-sm"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Markup rules (JSON)</span>
          <textarea
            name="markupRules"
            rows={3}
            defaultValue="{}"
            className="border rounded px-3 py-1.5 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Extra prompt</span>
          <textarea name="extraPrompt" rows={3} className="border rounded px-3 py-1.5 text-sm" />
        </label>
        <button
          type="submit"
          className="self-start bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          Create profile
        </button>
      </form>
    </div>
  );
}

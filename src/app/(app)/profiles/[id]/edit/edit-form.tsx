'use client';

import { useActionState } from 'react';
import { PROFILE_FORMATS } from '../../../../../server/profiles/schema';
import { type ProfileActionState, updateProfileAction } from '../../actions';

type Profile = {
  id: number;
  name: string;
  format: string;
  style: string;
  audience: string;
  targetVolumeMin: number;
  targetVolumeMax: number;
  markupRules: unknown;
  extraPrompt: string;
  lightResearchSources: number;
  lightMaxWords: number;
};

export function EditForm({ profile }: { profile: Profile }) {
  const [state, dispatch] = useActionState<ProfileActionState, FormData>(updateProfileAction, null);

  return (
    <>
      {state && !state.ok && (
        <div className="text-red-600 text-sm border border-red-200 rounded p-3">
          Validation error: please check your inputs.
        </div>
      )}
      <form action={dispatch} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={profile.id} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <input
            name="name"
            type="text"
            defaultValue={profile.name}
            required
            className="border rounded px-3 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Format</span>
          <select
            name="format"
            defaultValue={profile.format}
            required
            className="border rounded px-3 py-1.5 text-sm"
          >
            {PROFILE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Style</span>
          <input
            name="style"
            type="text"
            defaultValue={profile.style}
            required
            className="border rounded px-3 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Audience</span>
          <input
            name="audience"
            type="text"
            defaultValue={profile.audience}
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
              defaultValue={profile.targetVolumeMin}
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
              defaultValue={profile.targetVolumeMax}
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
            defaultValue={JSON.stringify(profile.markupRules ?? {})}
            className="border rounded px-3 py-1.5 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Extra prompt</span>
          <textarea
            name="extraPrompt"
            rows={3}
            defaultValue={profile.extraPrompt}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </label>
        <fieldset className="flex flex-col gap-4 border rounded p-3">
          <legend className="text-sm font-medium px-1">Light mode</legend>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Research sources</span>
            <select
              name="lightResearchSources"
              defaultValue={String(profile.lightResearchSources)}
              className="border rounded px-3 py-1.5 text-sm"
            >
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Max words</span>
            <input
              name="lightMaxWords"
              type="number"
              min={200}
              max={2500}
              step={50}
              defaultValue={profile.lightMaxWords}
              className="border rounded px-3 py-1.5 text-sm"
            />
          </label>
        </fieldset>
        <button
          type="submit"
          className="self-start bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          Save changes
        </button>
      </form>
    </>
  );
}

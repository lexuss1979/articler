'use client';

import { useActionState } from 'react';
import { createBatchAction } from '../actions';
import type { BatchActionState } from '../actions';

type Profile = { id: number; name: string };

function ErrorBanner({ state }: { state: Exclude<BatchActionState, null> }) {
  if (state.ok !== false) return null;

  let message: string;
  switch (state.error) {
    case 'no_topics':
      message = 'Please enter at least one topic (no topics provided).';
      break;
    case 'too_many_topics':
      message = 'Too many topics — maximum is 50.';
      break;
    case 'profile_not_owned':
      message = 'Selected profile does not belong to your account.';
      break;
    case 'daily_session_cap_exceeded': {
      const d = state.details;
      message = `Daily session cap exceeded — ${d.current} of ${d.cap} sessions used${d.requested ? ` (requested ${d.requested})` : ''}.`;
      break;
    }
    case 'daily_image_cap_exceeded': {
      const d = state.details;
      message = `Daily image cap exceeded — ${d.current} of ${d.cap} images used${d.requested ? ` (requested ${d.requested})` : ''}.`;
      break;
    }
    case 'monthly_usd_exceeded': {
      const d = state.details;
      message = `Monthly spend cap exceeded — $${d.current.toFixed(2)} of $${d.cap.toFixed(2)} used.`;
      break;
    }
    default:
      message = 'An error occurred.';
  }

  return (
    <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
  );
}

export function BatchForm({ profiles }: { profiles: Profile[] }) {
  const [state, action, pending] = useActionState(createBatchAction, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state && <ErrorBanner state={state} />}

      <div className="flex flex-col gap-1">
        <label htmlFor="profileId" className="text-sm font-medium text-gray-700">
          Profile
        </label>
        <select
          id="profileId"
          name="profileId"
          required
          className="rounded border px-3 py-2 text-sm"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="topics" className="text-sm font-medium text-gray-700">
          Topics
        </label>
        <textarea
          id="topics"
          name="topics"
          rows={10}
          placeholder="One topic per line, up to 50 lines"
          required
          className="rounded border px-3 py-2 text-sm font-mono"
        />
        <p className="text-xs text-gray-500">Enter one topic per line. Duplicates are removed.</p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create batch'}
      </button>
    </form>
  );
}

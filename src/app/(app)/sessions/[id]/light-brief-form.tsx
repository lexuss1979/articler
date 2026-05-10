'use client';

import { useActionState } from 'react';
import { submitBriefAction } from './actions';

type FormState = { ok: false; error: 'validation'; issues: string } | null;

export function LightBriefForm({ sessionId }: { sessionId: number }) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(
    (_, formData) => submitBriefAction(sessionId, formData),
    null,
  );

  return (
    <form action={dispatch} className="flex flex-col gap-4">
      {state?.error === 'validation' && (
        <p className="text-red-600 text-sm">{state.issues}</p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="topic" className="text-sm font-medium">
          Topic <span className="text-red-500">*</span>
        </label>
        <input
          id="topic"
          name="topic"
          type="text"
          required
          maxLength={200}
          className="border rounded px-3 py-2 text-sm"
          placeholder="e.g. Prompt caching in LLM applications"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 self-start"
      >
        {pending ? 'Starting…' : 'Start writing'}
      </button>
    </form>
  );
}

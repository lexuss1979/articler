'use client';

import { useActionState, useState } from 'react';
import { submitBriefAction } from './actions';

type FormState = { ok: false; error: 'validation'; issues: string } | null;

export function BriefForm({ sessionId, isRewrite }: { sessionId: number; isRewrite: boolean }) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(
    (_, formData) => submitBriefAction(sessionId, formData),
    null,
  );
  const [articleCount, setArticleCount] = useState(0);

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

      <div className="flex flex-col gap-1">
        <label htmlFor="goal" className="text-sm font-medium">
          Goal
        </label>
        <input
          id="goal"
          name="goal"
          type="text"
          maxLength={500}
          className="border rounded px-3 py-2 text-sm"
          placeholder="What should readers walk away knowing?"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          maxLength={2000}
          rows={4}
          className="border rounded px-3 py-2 text-sm resize-y"
          placeholder="Constraints, tone, prior art, etc."
        />
      </div>

      {isRewrite && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Source articles</p>
          {Array.from({ length: articleCount }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1 border rounded p-3">
              <input
                name={`sourceArticles[${i}][url]`}
                type="url"
                className="border rounded px-2 py-1 text-sm"
                placeholder="https://..."
              />
              <textarea
                name={`sourceArticles[${i}][content]`}
                rows={3}
                className="border rounded px-2 py-1 text-sm resize-y"
                placeholder="Paste article content…"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setArticleCount((n) => n + 1)}
            className="text-sm text-blue-600 underline self-start"
          >
            + Add source article
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 self-start"
      >
        {pending ? 'Saving…' : 'Continue to planning'}
      </button>
    </form>
  );
}

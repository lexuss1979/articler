'use client';

import { useState } from 'react';

export function ClarificationForm({
  questions,
  sessionId,
}: {
  questions: string[];
  sessionId: number;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await fetch(`/api/sessions/${sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: { answers } }),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <p className="text-sm font-medium text-gray-700">
        The agent needs a few more details before planning:
      </p>
      {questions.map((q, i) => (
        <div key={i} className="flex flex-col gap-1">
          <label className="text-sm font-medium">{q}</label>
          <textarea
            rows={2}
            value={answers[i]}
            onChange={(ev) => {
              const next = [...answers];
              next[i] = ev.target.value;
              setAnswers(next);
            }}
            className="border rounded px-3 py-2 text-sm resize-y"
            required
          />
        </div>
      ))}
      <button
        type="submit"
        disabled={sending || answers.some((a) => !a.trim())}
        className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 self-start"
      >
        {sending ? 'Sending…' : 'Submit answers'}
      </button>
    </form>
  );
}

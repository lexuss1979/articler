'use client';

import { useState } from 'react';
import type { ClarifyQuestion } from '../../../../server/pipeline/stages/clarify-brief';

export function ClarificationForm({
  questions,
  sessionId,
}: {
  questions: ClarifyQuestion[];
  sessionId: number;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [sending, setSending] = useState(false);

  function setAnswer(i: number, value: string) {
    const next = [...answers];
    next[i] = value;
    setAnswers(next);
  }

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
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
      <p className="text-sm font-medium text-gray-700">
        A few clarifying questions before planning:
      </p>

      {questions.map((q, i) => (
        <div key={i} className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-800">{q.question}</label>

          <div className="flex flex-wrap gap-1.5">
            {q.suggestions.map((s) => {
              const selected = answers[i] === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAnswer(i, selected ? '' : s)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={answers[i]}
            onChange={(ev) => setAnswer(i, ev.target.value)}
            placeholder="Or type your own answer…"
            className="border rounded px-3 py-2 text-sm"
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

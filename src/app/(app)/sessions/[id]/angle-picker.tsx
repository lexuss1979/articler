'use client';

import { useState } from 'react';
import type { Angle } from '../../../../server/sessions/plan';

export function AnglePicker({
  angles,
  sessionId,
}: {
  angles: Angle[];
  sessionId: number;
}) {
  const [selecting, setSelecting] = useState<number | null>(null);

  async function handleChoose(index: number) {
    setSelecting(index);
    try {
      await fetch(`/api/sessions/${sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: { index } }),
      });
    } finally {
      setSelecting(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-gray-700">
        Choose an angle and methodology for the article:
      </p>
      {angles.map((angle, i) => (
        <div key={i} className="border rounded p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">{angle.title}</h3>
            <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
              {angle.methodology}
            </span>
          </div>
          <p className="text-sm text-gray-600">{angle.rationale}</p>
          <button
            onClick={() => void handleChoose(i)}
            disabled={selecting !== null}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50 self-start"
          >
            {selecting === i ? 'Choosing…' : 'Choose this angle'}
          </button>
        </div>
      ))}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { acceptSourceAction, rejectSourceAction, assignSourceSectionAction } from './actions';
import type { InferSelectModel } from 'drizzle-orm';
import type { sources } from '../../../../server/db/schema';
import type { Plan } from '../../../../server/sessions/plan';

type SourceRow = InferSelectModel<typeof sources>;

export function SourceCard({
  source,
  plan,
  onUpdate,
}: {
  source: SourceRow;
  plan: Plan;
  onUpdate: (updated: SourceRow) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleAccept() {
    setBusy(true);
    try {
      const result = await acceptSourceAction(source.sessionId, source.id);
      if (result.ok) onUpdate({ ...source, status: 'accepted' });
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      const result = await rejectSourceAction(source.sessionId, source.id);
      if (result.ok) onUpdate({ ...source, status: 'rejected' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSection(sectionId: string | null) {
    setBusy(true);
    try {
      const result = await assignSourceSectionAction(source.sessionId, source.id, sectionId);
      if (result.ok) onUpdate({ ...source, sectionId });
    } finally {
      setBusy(false);
    }
  }

  const borderClass =
    source.status === 'accepted'
      ? 'border-green-400'
      : source.status === 'rejected'
        ? 'border-gray-200 opacity-50'
        : 'border-gray-200';

  return (
    <div className={`border rounded p-3 flex flex-col gap-2 ${borderClass}`}>
      <div className="flex items-start justify-between gap-2">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-blue-600 hover:underline truncate"
        >
          {source.title}
        </a>
        <span className="text-xs text-gray-400 shrink-0">{source.relevanceScore}/100</span>
      </div>
      <p className="text-xs text-gray-600 line-clamp-3">{source.summary || source.rawExcerpt}</p>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={() => void handleAccept()}
          disabled={busy || source.status === 'accepted'}
          className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-40"
        >
          Accept
        </button>
        <button
          onClick={() => void handleReject()}
          disabled={busy || source.status === 'rejected'}
          className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40"
        >
          Reject
        </button>
        <select
          value={source.sectionId ?? ''}
          disabled={busy}
          onChange={(e) => void handleSection(e.target.value || null)}
          className="ml-auto text-xs border rounded px-1 py-0.5 bg-white"
        >
          <option value="">— section —</option>
          {plan.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { dismissFindingAction, applyFindingAction, rewriteFromFindingAction } from './actions';
import type { InferSelectModel } from 'drizzle-orm';
import type { critiqueFindings } from '../../../../server/db/schema';

type FindingRow = InferSelectModel<typeof critiqueFindings>;

const severityColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700',
  minor: 'bg-yellow-100 text-yellow-700',
  major: 'bg-red-100 text-red-700',
};

const statusWrapperClass: Record<string, string> = {
  dismissed: 'opacity-40',
  applied: 'opacity-60',
  rewritten: 'opacity-60',
  open: '',
};

export function FindingCard({
  sessionId,
  finding,
  onScrollToSection,
}: {
  sessionId: number;
  finding: FindingRow;
  onScrollToSection?: (sectionId: string) => void;
}) {
  const [status, setStatus] = useState(finding.status);
  const [busy, setBusy] = useState(false);

  const span = finding.span as { sectionId?: string; charStart?: number; charEnd?: number };

  async function handleDismiss() {
    setBusy(true);
    const result = await dismissFindingAction(sessionId, finding.id);
    if (result.ok) setStatus('dismissed');
    setBusy(false);
  }

  async function handleApply() {
    setBusy(true);
    const result = await applyFindingAction(sessionId, finding.id);
    if (result.ok) setStatus('applied');
    setBusy(false);
  }

  async function handleRewrite() {
    setBusy(true);
    const result = await rewriteFromFindingAction(sessionId, finding.id);
    if (result.ok) setStatus('rewritten');
    setBusy(false);
  }

  return (
    <div className={`border rounded p-3 flex flex-col gap-2 text-sm ${statusWrapperClass[status] ?? ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${severityColors[finding.severity] ?? 'bg-gray-100 text-gray-600'}`}>
          {finding.severity}
        </span>
        {span.sectionId && (
          <button
            className="text-xs text-blue-500 hover:underline"
            onClick={() => onScrollToSection?.(span.sectionId!)}
          >
            §{span.sectionId}
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{finding.criticId}</span>
      </div>
      <p className="font-medium text-gray-800">{finding.problem}</p>
      <p className="text-gray-600">{finding.suggestedChange}</p>
      {finding.rationale && (
        <p className="text-xs text-gray-400 italic">{finding.rationale}</p>
      )}
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => void handleDismiss()}
          disabled={busy || status === 'dismissed'}
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-40"
        >
          Dismiss
        </button>
        <button
          onClick={() => void handleApply()}
          disabled={busy || status === 'applied'}
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-40"
        >
          Mark applied
        </button>
        <button
          onClick={() => void handleRewrite()}
          disabled={busy || status === 'rewritten'}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Rewrite section
        </button>
      </div>
    </div>
  );
}

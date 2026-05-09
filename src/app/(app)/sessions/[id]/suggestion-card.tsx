'use client';

import { useState } from 'react';
import type { DecorationSuggestion } from '../../../../server/sessions/decoration';
import { acceptDecorationAction, rejectDecorationAction } from './actions';

const kindColors: Record<string, string> = {
  pull_quote: 'bg-purple-100 text-purple-700',
  callout: 'bg-amber-100 text-amber-700',
  code_block: 'bg-slate-100 text-slate-700',
  comparison_table: 'bg-emerald-100 text-emerald-700',
  info_box: 'bg-sky-100 text-sky-700',
};

const statusWrapperClass: Record<string, string> = {
  proposed: '',
  accepted: 'opacity-60',
  rejected: 'opacity-40 line-through',
};

function PreviewBlock({ kind, contentMd }: { kind: string; contentMd: string }) {
  if (kind === 'code_block') {
    return (
      <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">
        {contentMd}
      </pre>
    );
  }
  if (kind === 'pull_quote') {
    return (
      <blockquote className="text-sm italic border-l-4 border-purple-400 bg-purple-50 px-3 py-2 text-purple-900">
        {contentMd}
      </blockquote>
    );
  }
  return (
    <div className="text-sm bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap">
      {contentMd}
    </div>
  );
}

export function SuggestionCard({
  sessionId,
  suggestion,
  sectionTitle,
  onScrollToSection,
  onStatusChange,
}: {
  sessionId: number;
  suggestion: DecorationSuggestion;
  sectionTitle: string;
  onScrollToSection?: (sectionId: string) => void;
  onStatusChange?: (suggestionId: string, status: 'accepted' | 'rejected') => void;
}) {
  const [busy, setBusy] = useState(false);
  const disabled = busy || suggestion.status !== 'proposed';

  async function handleAccept() {
    setBusy(true);
    const result = await acceptDecorationAction(sessionId, suggestion.id);
    setBusy(false);
    if (result.ok) onStatusChange?.(suggestion.id, 'accepted');
  }

  async function handleReject() {
    setBusy(true);
    const result = await rejectDecorationAction(sessionId, suggestion.id);
    setBusy(false);
    if (result.ok) onStatusChange?.(suggestion.id, 'rejected');
  }

  return (
    <div
      className={`border rounded p-3 flex flex-col gap-2 text-sm ${statusWrapperClass[suggestion.status] ?? ''}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-medium ${kindColors[suggestion.kind] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {suggestion.kind}
        </span>
        <button
          className="text-xs text-blue-500 hover:underline"
          onClick={() => onScrollToSection?.(suggestion.sectionId)}
        >
          §{sectionTitle}
        </button>
        <span className="text-xs text-gray-500">¶{suggestion.paragraphIndex}</span>
        {suggestion.status === 'accepted' && (
          <span className="text-xs text-green-600 italic">applied</span>
        )}
        {suggestion.status === 'rejected' && (
          <span className="text-xs text-gray-500 italic">rejected</span>
        )}
      </div>
      <PreviewBlock kind={suggestion.kind} contentMd={suggestion.contentMd} />
      <p className="text-xs text-gray-600">{suggestion.rationale}</p>
      <div className="flex gap-2">
        <button
          onClick={() => void handleAccept()}
          disabled={disabled}
          className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-40"
        >
          Accept
        </button>
        <button
          onClick={() => void handleReject()}
          disabled={disabled}
          className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 disabled:opacity-40"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

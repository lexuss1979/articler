'use client';

import type { InferSelectModel } from 'drizzle-orm';
import type { critiqueFindings } from '../../../../server/db/schema';

type FindingRow = InferSelectModel<typeof critiqueFindings>;

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  minor: 'bg-blue-100 text-blue-700',
};

const statusWrapperClass: Record<string, string> = {
  pending_apply: 'opacity-70',
  applied: 'opacity-60',
  open: '',
};

export function FindingCard({
  finding,
  included,
  onToggle,
  onScrollToSection,
  disabled,
}: {
  finding: FindingRow;
  included?: boolean;
  onToggle?: () => void;
  onScrollToSection?: (sectionId: string) => void;
  disabled?: boolean;
}) {
  const span = finding.span as { sectionId?: string; charStart?: number; charEnd?: number };
  const showCheckbox = onToggle !== undefined;

  return (
    <div
      className={`border rounded p-3 flex gap-3 text-sm ${statusWrapperClass[finding.status] ?? ''}`}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={!!included}
          onChange={onToggle}
          disabled={disabled}
          className="mt-1 shrink-0"
        />
      )}
      <div className="flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-medium ${severityColors[finding.severity] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {finding.severity}
          </span>
          {span.sectionId && span.sectionId !== 'overall' && (
            <button
              className="text-xs text-blue-500 hover:underline"
              onClick={() => onScrollToSection?.(span.sectionId!)}
            >
              §{span.sectionId}
            </button>
          )}
          {finding.status === 'pending_apply' && (
            <span className="text-xs text-gray-500 italic">in pending revision</span>
          )}
          {finding.status === 'applied' && (
            <span className="text-xs text-green-600 italic">applied</span>
          )}
        </div>
        <p className="font-medium text-gray-800">{finding.problem}</p>
        <p className="text-gray-600">{finding.suggestedChange}</p>
      </div>
    </div>
  );
}

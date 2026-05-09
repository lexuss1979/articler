'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptRevisionsAction, discardRevisionsAction } from './actions';
import type { InferSelectModel } from 'drizzle-orm';
import type { critiqueFindings } from '../../../../server/db/schema';

type FindingRow = InferSelectModel<typeof critiqueFindings>;

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  minor: 'bg-blue-100 text-blue-700',
};

export function RevisionReview({
  sessionId,
  originalMd,
  revisedMd,
  appliedFindings,
}: {
  sessionId: number;
  originalMd: string;
  revisedMd: string;
  appliedFindings: FindingRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'accept' | 'discard' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAccept() {
    setBusy('accept');
    setErrorMessage(null);
    const result = await acceptRevisionsAction(sessionId);
    if (!result.ok) {
      setErrorMessage(`Accept failed: ${result.error}`);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  async function handleDiscard() {
    setBusy('discard');
    setErrorMessage(null);
    const result = await discardRevisionsAction(sessionId);
    if (!result.ok) {
      setErrorMessage(`Discard failed: ${result.error}`);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Pending revision</h3>
        <div className="flex gap-2">
          <button
            onClick={() => void handleDiscard()}
            disabled={busy !== null}
            className="text-xs px-3 py-1.5 rounded border hover:bg-gray-50 disabled:opacity-40"
          >
            {busy === 'discard' ? 'Discarding…' : 'Discard'}
          </button>
          <button
            onClick={() => void handleAccept()}
            disabled={busy !== null}
            className="text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept revision'}
          </button>
        </div>
      </div>

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
        <div className="flex flex-col border rounded overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-medium text-gray-600">
            Was
          </div>
          <pre className="flex-1 overflow-auto p-3 text-xs whitespace-pre-wrap font-sans text-gray-700">
            {originalMd}
          </pre>
        </div>

        <div className="flex flex-col border rounded overflow-hidden">
          <div className="px-3 py-1.5 bg-green-50 border-b text-xs font-medium text-green-700">
            Became
          </div>
          <pre className="flex-1 overflow-auto p-3 text-xs whitespace-pre-wrap font-sans text-gray-800">
            {revisedMd}
          </pre>
        </div>

        <div className="flex flex-col border rounded overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-medium text-gray-600">
            Applied comments ({appliedFindings.length})
          </div>
          <div className="flex-1 overflow-auto p-3 flex flex-col gap-2">
            {appliedFindings.length === 0 ? (
              <p className="text-xs text-gray-400">No findings recorded.</p>
            ) : (
              appliedFindings.map((f) => (
                <div key={f.id} className="border rounded p-2 text-xs flex flex-col gap-1">
                  <span
                    className={`self-start px-1.5 py-0.5 rounded font-medium ${severityColors[f.severity] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {f.severity}
                  </span>
                  <p className="font-medium text-gray-800">{f.problem}</p>
                  <p className="text-gray-600">{f.suggestedChange}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

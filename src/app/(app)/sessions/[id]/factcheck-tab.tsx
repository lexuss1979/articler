'use client';

import { useState } from 'react';
import { startFactCheckAction } from './actions';
import { ClaimCard } from './claim-card';
import type { InferSelectModel } from 'drizzle-orm';
import type { claims, claimVerdicts } from '../../../../server/db/schema';

type ClaimRow = InferSelectModel<typeof claims>;
type VerdictRow = InferSelectModel<typeof claimVerdicts>;
export type ClaimWithVerdict = { claim: ClaimRow; verdict: VerdictRow | null };

export function FactCheckTab({
  sessionId,
  claimsWithVerdicts,
  activeTasks,
  onScrollToSection,
}: {
  sessionId: number;
  claimsWithVerdicts: ClaimWithVerdict[];
  activeTasks: Set<string>;
  onScrollToSection?: (sectionId: string) => void;
}) {
  const [forceRerun, setForceRerun] = useState(false);
  const [running, setRunning] = useState(false);

  const isChecking =
    activeTasks.has('extract_claims') || activeTasks.has('adjudicate_claim');

  async function handleRunFactCheck() {
    setRunning(true);
    await startFactCheckAction(sessionId, forceRerun);
    setRunning(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Fact-check</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={forceRerun}
              onChange={(e) => setForceRerun(e.target.checked)}
            />
            Force re-run
          </label>
          <button
            onClick={() => void handleRunFactCheck()}
            disabled={running}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {running ? 'Starting…' : 'Run fact-check'}
          </button>
        </div>
      </div>

      {isChecking && (
        <div className="flex items-center gap-2 text-xs text-blue-500">
          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Checking…
        </div>
      )}

      {claimsWithVerdicts.length === 0 ? (
        <p className="text-xs text-gray-400">No claims yet. Run a fact-check to get started.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {claimsWithVerdicts.map(({ claim, verdict }) => (
            <ClaimCard
              key={claim.id}
              sessionId={sessionId}
              claim={claim}
              verdict={verdict}
              onScrollToSection={onScrollToSection}
            />
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  acceptClaimCorrectionAction,
  dismissClaimAction,
  markClaimOpinionAction,
} from './actions';
import type { InferSelectModel } from 'drizzle-orm';
import type { claims, claimVerdicts, claimEvidence } from '../../../../server/db/schema';

type ClaimRow = InferSelectModel<typeof claims>;
type VerdictRow = InferSelectModel<typeof claimVerdicts>;
type EvidenceRow = InferSelectModel<typeof claimEvidence>;

const verdictColors: Record<string, string> = {
  verified: 'bg-green-100 text-green-700',
  contradicted: 'bg-red-100 text-red-700',
  unverifiable: 'bg-gray-100 text-gray-600',
  needs_caveat: 'bg-amber-100 text-amber-700',
};

export function ClaimCard({
  sessionId,
  claim,
  verdict,
  evidence,
  onScrollToSection,
}: {
  sessionId: number;
  claim: ClaimRow;
  verdict: VerdictRow | null;
  evidence?: EvidenceRow[];
  onScrollToSection?: (sectionId: string) => void;
}) {
  const [status, setStatus] = useState(claim.status);
  const [busy, setBusy] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const span = claim.span as { sectionId?: string };

  async function handleAccept() {
    setBusy(true);
    const result = await acceptClaimCorrectionAction(sessionId, claim.id);
    if (result.ok) setStatus('dismissed');
    setBusy(false);
  }

  async function handleDismiss() {
    setBusy(true);
    const result = await dismissClaimAction(sessionId, claim.id);
    if (result.ok) setStatus('dismissed');
    setBusy(false);
  }

  async function handleOpinion() {
    setBusy(true);
    const result = await markClaimOpinionAction(sessionId, claim.id);
    if (result.ok) setStatus('opinion');
    setBusy(false);
  }

  const muted = status === 'dismissed' || status === 'opinion';

  return (
    <div className={`border rounded p-3 flex flex-col gap-2 text-sm ${muted ? 'opacity-40' : ''}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
          {claim.claimType}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
          {claim.checkWorthiness}
        </span>
        {span.sectionId && (
          <button
            className="text-xs text-blue-500 hover:underline"
            onClick={() => onScrollToSection?.(span.sectionId!)}
          >
            §{span.sectionId}
          </button>
        )}
        {status !== 'open' && (
          <span className="text-xs text-gray-400 ml-auto">{status}</span>
        )}
      </div>
      <p className="font-medium text-gray-800">{claim.claimText}</p>
      {verdict ? (
        <>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${verdictColors[verdict.verdict] ?? 'bg-gray-100 text-gray-600'}`}>
              {verdict.verdict}
            </span>
          </div>
          <p className="text-xs text-gray-600">{verdict.justification}</p>
          {evidence && evidence.length > 0 && (
            <div>
              <button
                className="text-xs text-blue-500 hover:underline"
                onClick={() => setShowEvidence((v) => !v)}
              >
                {showEvidence ? 'Hide' : 'Show'} {evidence.length} evidence item{evidence.length !== 1 ? 's' : ''}
              </button>
              {showEvidence && (
                <ul className="mt-1 flex flex-col gap-1">
                  {evidence.map((e) => (
                    <li key={e.id} className="text-xs border-l-2 pl-2 border-gray-200">
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        {e.url}
                      </a>
                      <span className={`ml-1 ${e.supports ? 'text-green-600' : 'text-red-500'}`}>
                        {e.supports ? '✓' : '✗'}
                      </span>
                      <p className="text-gray-500 mt-0.5">{e.snippet}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-400 italic">No verdict yet</p>
      )}
      <div className="flex gap-2 mt-1 flex-wrap">
        <button
          onClick={() => void handleAccept()}
          disabled={busy || !verdict || verdict.verdict === 'verified' || status !== 'open'}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Accept correction
        </button>
        <button
          onClick={() => void handleDismiss()}
          disabled={busy || status === 'dismissed'}
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-40"
        >
          Dismiss
        </button>
        <button
          onClick={() => void handleOpinion()}
          disabled={busy || status === 'opinion'}
          className="text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-40"
        >
          Mark as opinion
        </button>
      </div>
    </div>
  );
}

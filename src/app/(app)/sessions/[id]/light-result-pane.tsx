'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { InferSelectModel } from 'drizzle-orm';
import type { claims, claimVerdicts } from '../../../../server/db/schema';
import { revertToPreReviewAction, getClaimVerdictAction, verifyClaimAction, verifyAllClaimsAction } from './actions';
import { useSessionEvents } from './use-session-events';
import { LightClaimCard } from './light-claim-card';
import type { ClaimWithVerdict } from './factcheck-tab';

type ClaimRow = InferSelectModel<typeof claims>;
type VerdictRow = InferSelectModel<typeof claimVerdicts>;

const FORMATS = [
  { fmt: 'md', label: 'Markdown (.zip)' },
  { fmt: 'html', label: 'HTML (.zip)' },
  { fmt: 'docx', label: 'DOCX' },
  { fmt: 'pdf', label: 'PDF' },
] as const;

export function LightResultPane({
  sessionId,
  draftMd,
  previewHtml,
  draftMdPreReview,
  claimsWithVerdicts = [],
}: {
  sessionId: number;
  draftMd: string;
  previewHtml: string | null;
  draftMdPreReview: string | null;
  claimsWithVerdicts?: ClaimWithVerdict[];
}) {
  const [copied, setCopied] = useState(false);
  const [reverting, setReverting] = useState(false);
  const router = useRouter();

  const [claimsMap, setClaimsMap] = useState<Map<number, { claim: ClaimRow; verdict: VerdictRow | null }>>(() =>
    new Map(claimsWithVerdicts.map(({ claim, verdict }) => [claim.id, { claim, verdict }])),
  );
  const [verifyingIds, setVerifyingIds] = useState<Set<number>>(new Set());
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [budgetExceeded, setBudgetExceeded] = useState(false);

  const events = useSessionEvents(sessionId);
  const processedCount = useRef(0);

  useEffect(() => {
    const newEvents = events.slice(processedCount.current);
    for (const e of newEvents) {
      if (e.kind !== 'artifact_updated') continue;
      const payload = e.payload as { kind: string; claimId?: number };
      if (payload.kind !== 'claim_verdict' || payload.claimId == null) continue;
      const claimId = payload.claimId;
      void getClaimVerdictAction(sessionId, claimId).then((result) => {
        if (!result.ok) return;
        setClaimsMap((prev) => {
          const entry = prev.get(claimId);
          if (!entry) return prev;
          const next = new Map(prev);
          next.set(claimId, { ...entry, verdict: result.verdict });
          return next;
        });
        setVerifyingIds((prev) => {
          const next = new Set(prev);
          next.delete(claimId);
          return next;
        });
      });
    }
    processedCount.current = events.length;
  }, [events, sessionId]);

  function handleCopy() {
    void navigator.clipboard.writeText(draftMd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleVerify(claimId: number) {
    setVerifyingIds((prev) => new Set([...prev, claimId]));
    void verifyClaimAction(sessionId, claimId);
  }

  async function handleVerifyAll() {
    setVerifyingAll(true);
    const result = await verifyAllClaimsAction(sessionId);
    if (result.budgetExceeded) setBudgetExceeded(true);
    setVerifyingAll(false);
  }

  const claimEntries = [...claimsMap.values()].sort((a, b) => a.claim.id - b.claim.id);
  const hasVerifiable = claimEntries.some(
    ({ claim, verdict }) => verdict == null && claim.checkWorthiness !== 'low',
  );

  return (
    <div className="flex flex-col gap-4">
      <div data-slot="hero-image" className="border rounded p-6 text-center bg-gray-50">
        <p className="text-sm text-gray-400">Hero image generating…</p>
      </div>

      {previewHtml ? (
        <div className="border rounded overflow-hidden bg-white">
          <iframe
            title="Article preview"
            srcDoc={previewHtml}
            sandbox="allow-same-origin"
            className="w-full min-h-[60vh]"
          />
        </div>
      ) : (
        <p className="text-sm text-gray-400">No article yet</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
        >
          {copied ? 'Copied!' : 'Copy markdown'}
        </button>

        <button
          type="button"
          disabled={draftMdPreReview == null || reverting}
          title={draftMdPreReview == null ? 'Pre-review snapshot not available' : undefined}
          className="border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
          onClick={() => {
            if (reverting) return;
            setReverting(true);
            void revertToPreReviewAction(sessionId).then((result) => {
              if (result.ok) router.refresh();
            }).finally(() => setReverting(false));
          }}
        >
          {reverting ? 'Reverting…' : 'Revert to pre-review'}
        </button>

        {FORMATS.map(({ fmt, label }) => (
          <a
            key={fmt}
            href={`/api/sessions/${sessionId}/export?format=${fmt}`}
            download
            className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
          >
            {label}
          </a>
        ))}
      </div>

      <div data-slot="claims-panel" className="border rounded p-4 bg-gray-50">
        {claimEntries.length === 0 ? (
          <p className="text-sm text-gray-400">Claims will appear here once extracted.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">Claims to verify</h3>
              <button
                type="button"
                disabled={verifyingAll || !hasVerifiable}
                title={!hasVerifiable ? 'No verifiable claims found.' : undefined}
                onClick={() => void handleVerifyAll()}
                className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                {verifyingAll ? 'Verifying…' : 'Verify all'}
              </button>
            </div>
            {budgetExceeded && (
              <p className="text-sm text-red-600">Budget cap reached — verification stopped.</p>
            )}
            <div className="flex flex-col divide-y">
              {claimEntries.map(({ claim, verdict }) => (
                <LightClaimCard
                  key={claim.id}
                  claim={claim}
                  verdict={verdict}
                  verifying={verifyingIds.has(claim.id)}
                  onVerify={() => handleVerify(claim.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

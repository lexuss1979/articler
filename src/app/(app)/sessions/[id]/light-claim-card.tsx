'use client';

import type { InferSelectModel } from 'drizzle-orm';
import type { claims, claimVerdicts } from '../../../../server/db/schema';

type ClaimRow = InferSelectModel<typeof claims>;
type VerdictRow = InferSelectModel<typeof claimVerdicts>;

const verdictColors: Record<string, string> = {
  verified: 'bg-green-100 text-green-700',
  contradicted: 'bg-red-100 text-red-700',
  unverifiable: 'bg-gray-100 text-gray-600',
  needs_caveat: 'bg-amber-100 text-amber-700',
};

export function LightClaimCard({
  claim,
  verdict,
  verifying,
  onVerify,
}: {
  claim: ClaimRow;
  verdict: VerdictRow | null;
  verifying: boolean;
  onVerify: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex gap-1 flex-wrap">
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
          {claim.claimType}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
          {claim.checkWorthiness}
        </span>
      </div>

      <p className="font-medium text-gray-800 text-sm">{claim.claimText}</p>

      {verdict == null ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
            Pending verify
          </span>
          <button
            type="button"
            disabled={verifying}
            onClick={onVerify}
            className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {verifying ? 'Verifying…' : 'Verify'}
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <span
            className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${verdictColors[verdict.verdict] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {verdict.verdict}
          </span>
          <span className="text-xs text-gray-600">{verdict.justification}</span>
        </div>
      )}
    </div>
  );
}

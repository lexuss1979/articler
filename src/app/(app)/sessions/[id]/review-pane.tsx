'use client';

import { useEffect, useRef, useState } from 'react';
import { useSessionEvents } from './use-session-events';
import { finishReviewAction } from './actions';
import { CritiqueTab } from './critique-tab';
import type { CritiqueRoundWithFindings } from './critique-tab';
import type { InferSelectModel } from 'drizzle-orm';
import type { critiqueRounds, claims, claimVerdicts } from '../../../../server/db/schema';

type FactCheckRoundRow = InferSelectModel<typeof critiqueRounds>;
type ClaimRow = InferSelectModel<typeof claims>;
type VerdictRow = InferSelectModel<typeof claimVerdicts>;
type ClaimWithVerdict = { claim: ClaimRow; verdict: VerdictRow | null };

export function ReviewPane({
  sessionId,
  initialCritiqueRounds,
  initialFactCheckRounds,
  initialClaims,
  activeCriticIds,
}: {
  sessionId: number;
  initialCritiqueRounds: CritiqueRoundWithFindings[];
  initialFactCheckRounds: FactCheckRoundRow[];
  initialClaims: ClaimWithVerdict[];
  activeCriticIds: string[];
}) {
  const [activeTab, setActiveTab] = useState<'critique' | 'factcheck'>('critique');
  const [critiqueRounds, setCritiqueRounds] = useState(initialCritiqueRounds);
  const [factCheckRounds, setFactCheckRounds] = useState(initialFactCheckRounds);
  const [claimsWithVerdicts, setClaimsWithVerdicts] = useState(initialClaims);
  const [finishing, setFinishing] = useState(false);

  const events = useSessionEvents(sessionId);
  const processedCount = useRef(0);

  useEffect(() => {
    const newEvents = events.slice(processedCount.current);
    for (const e of newEvents) {
      if (e.kind === 'artifact_updated') {
        const payload = e.payload as {
          kind: string;
          finding?: InferSelectModel<typeof import('../../../../server/db/schema').critiqueFindings>;
          roundId?: number;
          findingCount?: number;
          claimId?: number;
          verdict?: string;
          claimCount?: number;
          verdictCount?: number;
        };
        if (payload.kind === 'finding' && payload.finding) {
          const f = payload.finding;
          setCritiqueRounds((prev) =>
            prev.map((r) =>
              r.id === f.roundId ? { ...r, findings: [...r.findings, f] } : r,
            ),
          );
        } else if (payload.kind === 'critique_round' && payload.roundId !== undefined) {
          setCritiqueRounds((prev) => {
            const exists = prev.some((r) => r.id === payload.roundId);
            if (exists) return prev;
            return [
              ...prev,
              {
                id: payload.roundId!,
                sessionId,
                kind: 'critique',
                draftHash: '',
                createdAt: new Date(),
                findings: [],
              } as CritiqueRoundWithFindings,
            ];
          });
        } else if (payload.kind === 'claim_verdict' && payload.claimId !== undefined) {
          setClaimsWithVerdicts((prev) =>
            prev.map((row) =>
              row.claim.id === payload.claimId
                ? {
                    ...row,
                    verdict: {
                      id: -1,
                      claimId: payload.claimId!,
                      verdict: payload.verdict ?? '',
                      justification: '',
                      createdAt: new Date(),
                    },
                  }
                : row,
            ),
          );
        } else if (payload.kind === 'factcheck_round' && payload.roundId !== undefined) {
          setFactCheckRounds((prev) => {
            const exists = prev.some((r) => r.id === payload.roundId);
            if (exists) return prev;
            return [
              ...prev,
              {
                id: payload.roundId!,
                sessionId,
                kind: 'factcheck',
                draftHash: '',
                createdAt: new Date(),
              } as FactCheckRoundRow,
            ];
          });
        }
      }
    }
    processedCount.current = events.length;
  }, [events, sessionId]);

  const hasAnyRound = critiqueRounds.length > 0 || factCheckRounds.length > 0;

  async function handleFinish() {
    setFinishing(true);
    const result = await finishReviewAction(sessionId);
    if (!result.ok) setFinishing(false);
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('critique')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'critique' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Critique
        </button>
        <button
          onClick={() => setActiveTab('factcheck')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'factcheck' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Fact-check
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'critique' ? (
          <CritiqueTab
            sessionId={sessionId}
            rounds={critiqueRounds}
            activeCriticIds={activeCriticIds}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-400">
              {claimsWithVerdicts.length === 0
                ? 'No fact-check runs yet.'
                : `${claimsWithVerdicts.length} claim${claimsWithVerdicts.length !== 1 ? 's' : ''} checked.`}
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-1 pt-2 border-t">
        <button
          onClick={() => void handleFinish()}
          disabled={!hasAnyRound || finishing}
          className="w-full bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-40"
        >
          {finishing ? 'Finishing…' : 'Finish review'}
        </button>
        {!hasAnyRound && (
          <p className="text-xs text-gray-400 text-center">
            Run at least one review or fact-check before finishing
          </p>
        )}
      </div>
    </div>
  );
}

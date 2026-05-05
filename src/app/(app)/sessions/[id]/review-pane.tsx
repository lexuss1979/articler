'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionEvents } from './use-session-events';
import { finishReviewAction } from './actions';
import { CritiqueTab } from './critique-tab';
import { FactCheckTab } from './factcheck-tab';
import { RevisionReview } from './revision-review';
import type { CritiqueRoundWithFindings } from './critique-tab';
import type { ClaimWithVerdict } from './factcheck-tab';
import type { InferSelectModel } from 'drizzle-orm';
import type { critiqueRounds, critiqueFindings } from '../../../../server/db/schema';

type FactCheckRoundRow = InferSelectModel<typeof critiqueRounds>;
type FindingRow = InferSelectModel<typeof critiqueFindings>;

export function ReviewPane({
  sessionId,
  initialCritiqueRounds,
  initialFactCheckRounds,
  initialClaims,
  activeCriticIds,
  draftMd,
  revisedDraftMd,
  revisionStatus,
}: {
  sessionId: number;
  initialCritiqueRounds: CritiqueRoundWithFindings[];
  initialFactCheckRounds: FactCheckRoundRow[];
  initialClaims: ClaimWithVerdict[];
  activeCriticIds: string[];
  draftMd: string;
  revisedDraftMd: string | null;
  revisionStatus: string | null;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'critique' | 'factcheck'>('critique');
  const [critiqueRounds, setCritiqueRounds] = useState(initialCritiqueRounds);
  const [factCheckRounds, setFactCheckRounds] = useState(initialFactCheckRounds);
  const [claimsWithVerdicts, setClaimsWithVerdicts] = useState(initialClaims);
  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Resync local state when server-side data refreshes (e.g. after revision
  // actions). Without this, `pending_apply` finding statuses stay stale and the
  // RevisionReview's "applied comments" column is empty.
  const [trackedInitialRounds, setTrackedInitialRounds] = useState(initialCritiqueRounds);
  if (trackedInitialRounds !== initialCritiqueRounds) {
    setTrackedInitialRounds(initialCritiqueRounds);
    setCritiqueRounds(initialCritiqueRounds);
  }
  const [trackedInitialFactCheck, setTrackedInitialFactCheck] = useState(initialFactCheckRounds);
  if (trackedInitialFactCheck !== initialFactCheckRounds) {
    setTrackedInitialFactCheck(initialFactCheckRounds);
    setFactCheckRounds(initialFactCheckRounds);
  }
  const [trackedInitialClaims, setTrackedInitialClaims] = useState(initialClaims);
  if (trackedInitialClaims !== initialClaims) {
    setTrackedInitialClaims(initialClaims);
    setClaimsWithVerdicts(initialClaims);
  }

  const events = useSessionEvents(sessionId);
  const processedCount = useRef(0);

  useEffect(() => {
    const newEvents = events.slice(processedCount.current);
    let shouldRefresh = false;
    for (const e of newEvents) {
      if (e.kind === 'task_started') {
        const payload = e.payload as { stage?: string };
        if (payload.stage) setActiveTasks((prev) => new Set(prev).add(payload.stage!));
      } else if (e.kind === 'task_completed') {
        const payload = e.payload as { stage?: string };
        if (payload.stage) {
          setActiveTasks((prev) => {
            const next = new Set(prev);
            next.delete(payload.stage!);
            return next;
          });
        }
      } else if (e.kind === 'artifact_updated') {
        const payload = e.payload as {
          kind: string;
          finding?: FindingRow;
          roundId?: number;
          claimId?: number;
          verdict?: string;
        };
        if (payload.kind === 'finding' && payload.finding) {
          const f = payload.finding;
          setCritiqueRounds((prev) => {
            const round = prev.find((r) => r.id === f.roundId);
            if (round) {
              if (round.findings.some((existing) => existing.id === f.id)) return prev;
              return prev.map((r) =>
                r.id === f.roundId ? { ...r, findings: [...r.findings, f] } : r,
              );
            }
            return [
              ...prev,
              {
                id: f.roundId,
                sessionId,
                kind: 'critique',
                draftHash: '',
                createdAt: new Date(),
                findings: [f],
              } as CritiqueRoundWithFindings,
            ];
          });
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
        } else if (payload.kind === 'revision_pending') {
          shouldRefresh = true;
        } else if (payload.kind === 'claim_verdict' && payload.claimId !== undefined) {
          setClaimsWithVerdicts((prev) =>
            prev.map((row) => {
              if (row.claim.id !== payload.claimId) return row;
              if (row.verdict?.verdict === payload.verdict) return row;
              return {
                ...row,
                verdict: {
                  id: -1,
                  claimId: payload.claimId!,
                  verdict: payload.verdict ?? '',
                  justification: '',
                  createdAt: new Date(),
                },
              };
            }),
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
    if (shouldRefresh) router.refresh();
  }, [events, sessionId, router]);

  const hasAnyRound = critiqueRounds.length > 0 || factCheckRounds.length > 0;
  const hasPendingRevision = revisionStatus === 'pending';

  const pendingFindings = useMemo(() => {
    if (!hasPendingRevision) return [] as FindingRow[];
    const all: FindingRow[] = [];
    for (const r of critiqueRounds) {
      for (const f of r.findings) {
        if (f.status === 'pending_apply') all.push(f);
      }
    }
    return all;
  }, [critiqueRounds, hasPendingRevision]);

  async function handleFinish() {
    setFinishing(true);
    setFinishError(null);
    const result = await finishReviewAction(sessionId);
    if (!result.ok) {
      setFinishing(false);
      setFinishError(result.error);
      console.error('[finishReview] failed:', result.error);
    }
  }

  if (hasPendingRevision && revisedDraftMd) {
    return (
      <RevisionReview
        sessionId={sessionId}
        originalMd={draftMd}
        revisedMd={revisedDraftMd}
        appliedFindings={pendingFindings}
      />
    );
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
            hasPendingRevision={hasPendingRevision}
          />
        ) : (
          <FactCheckTab
            sessionId={sessionId}
            claimsWithVerdicts={claimsWithVerdicts}
            activeTasks={activeTasks}
          />
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-1 pt-2 border-t">
        <button
          onClick={() => void handleFinish()}
          disabled={!hasAnyRound || finishing || hasPendingRevision}
          className="w-full bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-40"
        >
          {finishing ? 'Finishing…' : 'Finish review'}
        </button>
        {!hasAnyRound && (
          <p className="text-xs text-gray-400 text-center">
            Run at least one review or fact-check before finishing
          </p>
        )}
        {finishError && (
          <p className="text-xs text-red-600 text-center">
            Finish review failed: {finishError}
          </p>
        )}
      </div>
    </div>
  );
}

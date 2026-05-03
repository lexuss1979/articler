'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  startReviewAction,
  setActiveCriticsAction,
  applyRevisionsAction,
} from './actions';
import { FindingCard } from './finding-card';
import { BUILTIN_CRITICS } from '../../../../server/sessions/critics';
import type { InferSelectModel } from 'drizzle-orm';
import type { critiqueRounds, critiqueFindings } from '../../../../server/db/schema';

type RoundRow = InferSelectModel<typeof critiqueRounds>;
type FindingRow = InferSelectModel<typeof critiqueFindings>;

export type CritiqueRoundWithFindings = RoundRow & { findings: FindingRow[] };

const severityRank: Record<string, number> = { critical: 0, medium: 1, minor: 2 };

export function CritiqueTab({
  sessionId,
  rounds,
  activeCriticIds,
  hasPendingRevision,
  onScrollToSection,
}: {
  sessionId: number;
  rounds: CritiqueRoundWithFindings[];
  activeCriticIds: string[];
  hasPendingRevision: boolean;
  onScrollToSection?: (sectionId: string) => void;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [enabledIds, setEnabledIds] = useState<string[]>(activeCriticIds);
  const [savingCritics, setSavingCritics] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const latestRound = useMemo(
    () => (rounds.length > 0 ? [...rounds].sort((a, b) => b.id - a.id)[0] : null),
    [rounds],
  );

  const actionable = useMemo(
    () =>
      (latestRound?.findings ?? [])
        .filter((f) => f.severity === 'critical' || f.severity === 'medium')
        .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)),
    [latestRound],
  );

  const minor = useMemo(
    () => (latestRound?.findings ?? []).filter((f) => f.severity === 'minor'),
    [latestRound],
  );

  const [includedIds, setIncludedIds] = useState<Set<number>>(new Set());
  const [trackedRoundId, setTrackedRoundId] = useState<number | null>(null);

  if (latestRound && latestRound.id !== trackedRoundId) {
    setTrackedRoundId(latestRound.id);
    setIncludedIds(
      new Set(actionable.filter((f) => f.status === 'open').map((f) => f.id)),
    );
  }

  async function handleRunReview() {
    setRunning(true);
    setErrorMessage(null);
    const result = await startReviewAction(sessionId);
    if (!result.ok) setErrorMessage(`Review failed: ${result.error}`);
    setRunning(false);
  }

  function toggleBuiltin(id: string) {
    setEnabledIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSaveCritics() {
    setSavingCritics(true);
    await setActiveCriticsAction(sessionId, { enabledIds, custom: [] });
    setSavingCritics(false);
  }

  function toggleInclude(id: number) {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApply() {
    setApplying(true);
    setErrorMessage(null);
    const ids = [...includedIds];
    const result = await applyRevisionsAction(sessionId, ids);
    if (!result.ok) {
      setErrorMessage(`Apply failed: ${result.error}`);
      setApplying(false);
      return;
    }
    router.refresh();
    setApplying(false);
  }

  const canApply =
    !hasPendingRevision && actionable.length > 0 && includedIds.size > 0 && !applying;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Critique</h3>
        <button
          onClick={() => void handleRunReview()}
          disabled={running || hasPendingRevision}
          className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {running ? 'Running…' : 'Run review'}
        </button>
      </div>

      <div className="border rounded p-3 flex flex-col gap-2">
        <p className="text-xs font-medium text-gray-600">Active critic lenses</p>
        <div className="flex flex-col gap-1">
          {BUILTIN_CRITICS.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabledIds.includes(c.id)}
                onChange={() => toggleBuiltin(c.id)}
              />
              {c.label}
            </label>
          ))}
        </div>
        <button
          onClick={() => void handleSaveCritics()}
          disabled={savingCritics}
          className="self-start text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-40"
        >
          {savingCritics ? 'Saving…' : 'Save lens selection'}
        </button>
      </div>

      {errorMessage && (
        <p className="text-xs text-red-600">{errorMessage}</p>
      )}

      {!latestRound ? (
        <p className="text-xs text-gray-400">
          No critique rounds yet. Run a review to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Round #{latestRound.id} · {actionable.length} actionable · {minor.length} minor
            </p>
            <button
              onClick={() => void handleApply()}
              disabled={!canApply}
              className="text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
            >
              {applying ? 'Applying…' : `Apply ${includedIds.size} revision${includedIds.size === 1 ? '' : 's'}`}
            </button>
          </div>

          {actionable.length === 0 ? (
            <p className="text-xs text-gray-400">No critical or medium findings.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {actionable.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  included={includedIds.has(f.id)}
                  onToggle={() => toggleInclude(f.id)}
                  onScrollToSection={onScrollToSection}
                  disabled={hasPendingRevision || f.status !== 'open'}
                />
              ))}
            </div>
          )}

          {minor.length > 0 && (
            <details className="border rounded p-3">
              <summary className="text-xs font-medium text-gray-600 cursor-pointer select-none">
                Minor observations ({minor.length}) — informational, not applied
              </summary>
              <div className="flex flex-col gap-2 mt-3">
                {minor.map((f) => (
                  <FindingCard
                    key={f.id}
                    finding={f}
                    onScrollToSection={onScrollToSection}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

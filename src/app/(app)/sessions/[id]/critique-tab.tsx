'use client';

import { useState } from 'react';
import { startReviewAction, setActiveCriticsAction } from './actions';
import { FindingCard } from './finding-card';
import { BUILTIN_CRITICS } from '../../../../server/sessions/critics';
import type { InferSelectModel } from 'drizzle-orm';
import type { critiqueRounds, critiqueFindings } from '../../../../server/db/schema';

type RoundRow = InferSelectModel<typeof critiqueRounds>;
type FindingRow = InferSelectModel<typeof critiqueFindings>;

export type CritiqueRoundWithFindings = RoundRow & { findings: FindingRow[] };

export function CritiqueTab({
  sessionId,
  rounds,
  activeCriticIds,
  onScrollToSection,
}: {
  sessionId: number;
  rounds: CritiqueRoundWithFindings[];
  activeCriticIds: string[];
  onScrollToSection?: (sectionId: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [enabledIds, setEnabledIds] = useState<string[]>(activeCriticIds);
  const [customLabel, setCustomLabel] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [savingCritics, setSavingCritics] = useState(false);

  async function handleRunReview() {
    setRunning(true);
    await startReviewAction(sessionId);
    setRunning(false);
  }

  function toggleBuiltin(id: string) {
    setEnabledIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSaveCritics() {
    setSavingCritics(true);
    const custom =
      customLabel.trim() && customPrompt.trim()
        ? [{ id: '', label: customLabel.trim(), promptFragment: customPrompt.trim() }]
        : [];
    await setActiveCriticsAction(sessionId, { enabledIds, custom });
    if (custom.length) {
      setCustomLabel('');
      setCustomPrompt('');
    }
    setSavingCritics(false);
  }

  const sortedRounds = [...rounds].sort((a, b) => b.id - a.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Critique</h3>
        <button
          onClick={() => void handleRunReview()}
          disabled={running}
          className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {running ? 'Running…' : 'Run review'}
        </button>
      </div>

      <div className="border rounded p-3 flex flex-col gap-2">
        <p className="text-xs font-medium text-gray-600">Active critics</p>
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
        <div className="flex flex-col gap-1 mt-2">
          <p className="text-xs text-gray-500">Add custom critic</p>
          <input
            className="border rounded px-2 py-1 text-xs"
            placeholder="Label"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
          />
          <textarea
            className="border rounded px-2 py-1 text-xs"
            placeholder="Prompt fragment (what to look for…)"
            rows={3}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
          />
        </div>
        <button
          onClick={() => void handleSaveCritics()}
          disabled={savingCritics}
          className="self-start text-xs px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-40"
        >
          {savingCritics ? 'Saving…' : 'Save critics'}
        </button>
      </div>

      {sortedRounds.length === 0 ? (
        <p className="text-xs text-gray-400">No critique rounds yet. Run a review to get started.</p>
      ) : (
        sortedRounds.map((round) => {
          const bycritic = round.findings.reduce<Record<string, FindingRow[]>>((acc, f) => {
            (acc[f.criticId] ??= []).push(f);
            return acc;
          }, {});
          return (
            <div key={round.id} className="border rounded p-3 flex flex-col gap-3">
              <p className="text-xs text-gray-500">
                Round #{round.id} · {round.findings.length} finding{round.findings.length !== 1 ? 's' : ''}
              </p>
              {Object.entries(bycritic).map(([criticId, findings]) => (
                <div key={criticId} className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-600">{criticId}</p>
                  {findings.map((f) => (
                    <FindingCard
                      key={f.id}
                      sessionId={sessionId}
                      finding={f}
                      onScrollToSection={onScrollToSection}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

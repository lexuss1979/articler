'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionEvents } from './use-session-events';
import { startDecorationAction, finishDecorationAction } from './actions';
import { SuggestionCard } from './suggestion-card';
import type { Plan } from '../../../../server/sessions/plan';
import type {
  DecorationRound,
  DecorationState,
  DecorationSuggestion,
} from '../../../../server/sessions/decoration';

export function DecorationPane(props: {
  sessionId: number;
  plan: Plan;
  initialState: DecorationState;
  sectionDrafts: Array<{ sectionId: string; contentMd: string }>;
}) {
  const { sessionId, plan, initialState } = props;
  const [rounds, setRounds] = useState<DecorationRound[]>(initialState.rounds);
  const [trackedInitial, setTrackedInitial] = useState(initialState);
  if (trackedInitial !== initialState) {
    setTrackedInitial(initialState);
    setRounds(initialState.rounds);
  }

  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const events = useSessionEvents(sessionId);
  const processedCount = useRef(0);

  useEffect(() => {
    const newEvents = events.slice(processedCount.current);
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
          suggestion?: DecorationSuggestion;
          roundId?: string;
          suggestionCount?: number;
        };
        if (payload.kind === 'decoration_suggestion' && payload.suggestion) {
          const s = payload.suggestion;
          const matchRoundId = s.id.startsWith('s_') ? s.id.split('_').slice(1, -1).join('_') : null;
          setRounds((prev) => {
            const targetIdx = matchRoundId
              ? prev.findIndex((r) => r.id === matchRoundId)
              : -1;
            if (targetIdx >= 0) {
              const target = prev[targetIdx]!;
              if (target.suggestions.some((existing) => existing.id === s.id)) return prev;
              const next = [...prev];
              next[targetIdx] = { ...target, suggestions: [...target.suggestions, s] };
              return next;
            }
            if (!matchRoundId) return prev;
            return [
              ...prev,
              {
                id: matchRoundId,
                draftHash: '',
                createdAt: new Date().toISOString(),
                suggestions: [s],
              },
            ];
          });
        } else if (payload.kind === 'decoration_round' && payload.roundId) {
          setRounds((prev) => {
            if (prev.some((r) => r.id === payload.roundId)) return prev;
            return [
              ...prev,
              {
                id: payload.roundId!,
                draftHash: '',
                createdAt: new Date().toISOString(),
                suggestions: [],
              },
            ];
          });
        }
      }
    }
    processedCount.current = events.length;
  }, [events]);

  const sectionTitleMap = useMemo(
    () => new Map(plan.sections.map((s) => [s.id, s.title])),
    [plan],
  );
  const sectionOrder = useMemo(
    () => new Map(plan.sections.map((s, i) => [s.id, i])),
    [plan],
  );

  const orderedRounds = useMemo(() => [...rounds].slice().reverse(), [rounds]);

  const proposeBusy = activeTasks.has('propose_decoration') || running;
  const canFinish = rounds.length > 0;

  function applyLocalStatus(suggestionId: string, status: 'accepted' | 'rejected') {
    setRounds((prev) =>
      prev.map((round) => ({
        ...round,
        suggestions: round.suggestions.map((s) =>
          s.id === suggestionId ? { ...s, status } : s,
        ),
      })),
    );
  }

  async function handleRun() {
    setRunning(true);
    await startDecorationAction(sessionId);
    setRunning(false);
  }

  async function handleFinish() {
    setFinishing(true);
    const result = await finishDecorationAction(sessionId);
    if (!result.ok) setFinishing(false);
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="shrink-0 flex items-center gap-2">
        <button
          onClick={() => void handleRun()}
          disabled={proposeBusy}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-40"
        >
          {proposeBusy ? 'Proposing…' : 'Run decoration'}
        </button>
        {proposeBusy && (
          <span className="text-xs text-gray-500 italic">analysing draft…</span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
        {orderedRounds.length === 0 && (
          <p className="text-sm text-gray-500">
            No decoration suggestions yet. Click &ldquo;Run decoration&rdquo; to generate the first round.
          </p>
        )}
        {orderedRounds.map((round) => {
          const grouped = new Map<string, DecorationSuggestion[]>();
          for (const s of round.suggestions) {
            const arr = grouped.get(s.sectionId) ?? [];
            arr.push(s);
            grouped.set(s.sectionId, arr);
          }
          const groupedEntries = [...grouped.entries()].sort(([a], [b]) => {
            const ia = sectionOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
            const ib = sectionOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
            return ia - ib;
          });
          return (
            <div key={round.id} className="border rounded p-3 flex flex-col gap-3">
              <div className="text-xs text-gray-500">
                Round {round.id} · {round.suggestions.length} suggestion(s)
              </div>
              {groupedEntries.map(([sectionId, suggestions]) => (
                <div key={sectionId} className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-gray-700">
                    {sectionTitleMap.get(sectionId) ?? sectionId}
                  </div>
                  {suggestions.map((s) => (
                    <SuggestionCard
                      key={s.id}
                      sessionId={sessionId}
                      suggestion={s}
                      sectionTitle={sectionTitleMap.get(s.sectionId) ?? s.sectionId}
                      onStatusChange={applyLocalStatus}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 flex flex-col gap-1 pt-2 border-t">
        <button
          onClick={() => void handleFinish()}
          disabled={!canFinish || finishing}
          className="w-full bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-40"
        >
          {finishing ? 'Finishing…' : 'Finish decoration'}
        </button>
        {!canFinish && (
          <p className="text-xs text-gray-400 text-center">
            Run decoration at least once before finishing
          </p>
        )}
      </div>
    </div>
  );
}

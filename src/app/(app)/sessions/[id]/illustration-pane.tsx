'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionEvents } from './use-session-events';
import {
  finishIllustrationAction,
  startIllustrationAction,
  startSessionAction,
} from './actions';
import { ImageSlotCard } from './image-slot-card';
import type { Plan } from '../../../../server/sessions/plan';
import type { ImageSlot, ImageState } from '../../../../server/sessions/images';

export function IllustrationPane(props: {
  sessionId: number;
  plan: Plan;
  initialState: ImageState;
}) {
  const { sessionId, plan, initialState } = props;
  const [slots, setSlots] = useState<ImageSlot[]>(initialState.slots);
  const [trackedInitial, setTrackedInitial] = useState(initialState);
  if (trackedInitial !== initialState) {
    setTrackedInitial(initialState);
    setSlots(initialState.slots);
  }

  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

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
        const payload = e.payload as { kind?: string; slot?: ImageSlot };
        if (payload.kind === 'image_slot' && payload.slot) {
          const incoming = payload.slot;
          setSlots((prev) => {
            const idx = prev.findIndex((s) => s.id === incoming.id);
            if (idx < 0) return [...prev, incoming];
            const next = [...prev];
            next[idx] = incoming;
            return next;
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

  const orderedSlots = useMemo(() => {
    const heroes = slots.filter((s) => s.kind === 'hero');
    const inlines = [...slots.filter((s) => s.kind === 'inline')].sort((a, b) => {
      const ia = a.sectionId ? (sectionOrder.get(a.sectionId) ?? Number.MAX_SAFE_INTEGER) : 0;
      const ib = b.sectionId ? (sectionOrder.get(b.sectionId) ?? Number.MAX_SAFE_INTEGER) : 0;
      return ia - ib;
    });
    return [...heroes, ...inlines];
  }, [slots, sectionOrder]);

  const proposeBusy = activeTasks.has('propose_image_slots') || running;
  const canFinish = slots.length > 0;

  function applySlotChange(next: ImageSlot) {
    setSlots((prev) => prev.map((s) => (s.id === next.id ? next : s)));
  }

  async function handleRun() {
    setRunning(true);
    await startIllustrationAction(sessionId);
    setRunning(false);
  }

  async function handleFinish() {
    setFinishing(true);
    setFinishError(null);
    const result = await finishIllustrationAction(sessionId);
    if (!result.ok) {
      setFinishing(false);
      setFinishError(result.error);
    }
  }

  async function handleResume() {
    setResuming(true);
    setFinishError(null);
    try {
      await startSessionAction(sessionId);
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {slots.length === 0 && (
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => void handleRun()}
            disabled={proposeBusy}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-40"
          >
            {proposeBusy ? 'Proposing…' : 'Run illustration proposal'}
          </button>
          {proposeBusy && (
            <span className="text-xs text-gray-500 italic">analysing draft…</span>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
        {orderedSlots.length === 0 && (
          <p className="text-sm text-gray-500">
            No image slots yet. Click &ldquo;Run illustration proposal&rdquo; to generate
            them.
          </p>
        )}
        {orderedSlots.map((slot) => (
          <ImageSlotCard
            key={slot.id}
            sessionId={sessionId}
            slot={slot}
            sectionTitle={
              slot.sectionId ? sectionTitleMap.get(slot.sectionId) : undefined
            }
            onSlotChange={applySlotChange}
          />
        ))}
      </div>

      <div className="shrink-0 flex flex-col gap-2 pt-2 border-t">
        <button
          onClick={() => void handleFinish()}
          disabled={!canFinish || finishing}
          className="w-full bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-40"
        >
          {finishing ? 'Finishing…' : 'Finish illustration'}
        </button>
        {!canFinish && (
          <p className="text-xs text-gray-400 text-center">
            Run illustration proposal at least once before finishing
          </p>
        )}
        {finishError === 'no_pending_illustration' && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-amber-700">
              Runner is not parked for this session. This usually happens after a server
              restart. Click Resume, then try Finish again.
            </p>
            <button
              onClick={() => void handleResume()}
              disabled={resuming}
              className="text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 self-start"
            >
              {resuming ? 'Resuming…' : 'Resume runner'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

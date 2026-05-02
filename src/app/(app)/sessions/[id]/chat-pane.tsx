'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startSessionAction } from './actions';

type RawEvent = { kind: string; payload: Record<string, unknown> };

const STAGE_LABEL: Record<string, string> = {
  clarify_brief: 'Clarifying brief',
  propose_angles: 'Proposing angles',
  build_plan: 'Building plan',
  plan_search_hypotheses: 'Planning research',
  formulate_queries: 'Formulating queries',
  web_search: 'Searching web',
  summarize_source: 'Summarizing source',
};

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage.replace(/_/g, ' ');
}

function taskDetail(payload: Record<string, unknown>): string {
  const count = payload.count as number | undefined;
  const cached = payload.cached as boolean | undefined;
  const score = payload.relevanceScore as number | undefined;
  if (cached) return 'cached';
  if (count !== undefined) return `${count}`;
  if (score !== undefined) return `score ${score}`;
  return '';
}

const EVENT_KINDS = [
  'state_changed',
  'task_started',
  'task_completed',
  'artifact_updated',
  'agent_message',
  'awaiting_user',
] as const;

export function ChatPane({ sessionId }: { sessionId: number }) {
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [started, setStarted] = useState(false);
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource(`/api/stream/${sessionId}`);
    for (const kind of EVENT_KINDS) {
      source.addEventListener(kind, (e: MessageEvent<string>) => {
        const payload = JSON.parse(e.data) as Record<string, unknown>;
        setEvents((prev) => [...prev, { kind, payload }]);
        if (kind === 'state_changed') router.refresh();
      });
    }
    return () => source.close();
  }, [sessionId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  async function handleStart() {
    setStarted(true);
    await startSessionAction(sessionId);
  }

  // Build feed: merge task_started + task_completed pairs, show messages and status changes
  type FeedItem =
    | { key: string; type: 'task'; label: string; done: boolean; detail: string }
    | { key: string; type: 'message'; text: string; error: boolean }
    | { key: string; type: 'status'; state: string };

  const feed: FeedItem[] = [];
  const taskMap = new Map<string, number>(); // stage -> feed index

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.kind === 'task_started') {
      const stage = (e.payload.stage as string) ?? '';
      const idx = feed.length;
      feed.push({ key: `task-${i}`, type: 'task', label: stageLabel(stage), done: false, detail: '' });
      taskMap.set(stage, idx);
    } else if (e.kind === 'task_completed') {
      const stage = (e.payload.stage as string) ?? '';
      const idx = taskMap.get(stage);
      const detail = taskDetail(e.payload);
      if (idx !== undefined) {
        feed[idx] = { key: `task-${idx}`, type: 'task', label: stageLabel(stage), done: true, detail };
        taskMap.delete(stage);
      }
    } else if (e.kind === 'agent_message') {
      feed.push({
        key: `msg-${i}`,
        type: 'message',
        text: (e.payload.text as string) ?? '',
        error: !!(e.payload.error as boolean | undefined),
      });
    } else if (e.kind === 'state_changed') {
      feed.push({ key: `status-${i}`, type: 'status', state: (e.payload.state as string) ?? '' });
    }
  }

  const isAwaiting = events.length > 0 && events[events.length - 1]!.kind === 'awaiting_user';

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2 border-b">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Activity</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">
        {feed.length === 0 && !started && (
          <button
            onClick={() => void handleStart()}
            className="self-start mt-1 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            Start
          </button>
        )}

        {feed.map((item) => {
          if (item.type === 'task') {
            return (
              <div key={item.key} className="flex items-center gap-1.5 py-0.5">
                {item.done ? (
                  <span className="text-green-500 text-xs">✓</span>
                ) : (
                  <span className="text-gray-300 text-xs animate-pulse">⟳</span>
                )}
                <span className={`text-xs ${item.done ? 'text-gray-600' : 'text-gray-800'}`}>
                  {item.label}
                </span>
                {item.detail && (
                  <span className="text-xs text-gray-400 ml-auto">{item.detail}</span>
                )}
              </div>
            );
          }
          if (item.type === 'message') {
            return (
              <div
                key={item.key}
                className={`mt-1 mb-1 rounded px-2 py-1.5 ${item.error ? 'bg-red-50' : 'bg-blue-50'}`}
              >
                <p className={`text-xs ${item.error ? 'text-red-700' : 'text-blue-800'}`}>
                  {item.text}
                </p>
              </div>
            );
          }
          if (item.type === 'status') {
            return (
              <div key={item.key} className="flex items-center gap-1.5 my-1">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 px-1">{item.state}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
            );
          }
          return null;
        })}

        {isAwaiting && (
          <div className="mt-1 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
            Waiting for input…
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

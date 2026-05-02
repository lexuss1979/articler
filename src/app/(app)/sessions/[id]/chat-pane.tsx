'use client';

import { useEffect, useState } from 'react';
import { startSessionAction } from './actions';

type EventEntry = {
  kind: string;
  data: string;
};

export function ChatPane({ sessionId }: { sessionId: number }) {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [started, setStarted] = useState(false);

  const latestKind = events.length > 0 ? events[events.length - 1].kind : null;
  const isAwaitingUser = latestKind === 'awaiting_user';

  useEffect(() => {
    const source = new EventSource(`/api/stream/${sessionId}`);

    source.addEventListener('message', () => {});

    const handleEvent = (kind: string) => (e: MessageEvent<string>) => {
      setEvents((prev) => [...prev, { kind, data: e.data }]);
    };

    const kinds = [
      'state_changed',
      'task_started',
      'task_progress',
      'task_completed',
      'artifact_updated',
      'cost_updated',
      'agent_message',
      'awaiting_user',
    ];

    for (const kind of kinds) {
      source.addEventListener(kind, handleEvent(kind) as EventListener);
    }

    return () => source.close();
  }, [sessionId]);

  async function handleStart() {
    setStarted(true);
    await startSessionAction(sessionId);
  }

  async function handleSend() {
    if (!inputText.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/sessions/${sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: { text: inputText } }),
      });
      setInputText('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="text-sm font-medium text-gray-500 px-3 py-2 border-b">Chat</div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {events.length === 0 && !started && (
          <button
            onClick={handleStart}
            className="self-start bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            Start
          </button>
        )}
        {events.map((e, i) => (
          <div key={i} className="text-xs text-gray-700">
            <span className="font-mono text-gray-400">[{e.kind}]</span> {e.data}
          </div>
        ))}
      </div>
      {isAwaitingUser && (
        <div className="border-t p-3 flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(ev) => setInputText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !sending) void handleSend();
            }}
            placeholder="Type a reply…"
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => void handleSend()}
            disabled={sending}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

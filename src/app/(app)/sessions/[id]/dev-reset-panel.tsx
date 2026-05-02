'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { devResetSessionAction } from './actions';

const STATES = ['planning', 'research', 'drafting', 'review'] as const;

export function DevResetPanel({ sessionId, currentState }: { sessionId: number; currentState: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function reset(state: string) {
    startTransition(async () => {
      await devResetSessionAction(sessionId, state);
      router.refresh();
    });
  }

  return (
    <div className="shrink-0 border-t border-dashed border-orange-300 bg-orange-50 px-4 py-2 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-orange-500 uppercase tracking-wide mr-1">Dev reset →</span>
      {STATES.map((s) => (
        <button
          key={s}
          disabled={isPending || s === currentState}
          onClick={() => reset(s)}
          className="text-xs px-2 py-0.5 rounded border border-orange-300 text-orange-700 hover:bg-orange-100 disabled:opacity-40 disabled:cursor-default"
        >
          {s}
        </button>
      ))}
      {isPending && <span className="text-xs text-orange-400">resetting…</span>}
    </div>
  );
}

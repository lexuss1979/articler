'use client';

import { useEffect, useState } from 'react';
import { useSessionEvents } from './use-session-events';

type Budget = {
  sessionSpent: number;
  sessionCap: number | null;
  userSpent: number;
  userCap: number | null;
};

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function SessionHeader({ sessionId }: { sessionId: number }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const events = useSessionEvents(sessionId);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sessions/${sessionId}/budget`)
      .then((r) => (r.ok ? (r.json() as Promise<Budget>) : null))
      .then((data) => {
        if (!cancelled && data) setBudget(data);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, events.filter((e) => e.kind === 'cost_updated' || e.kind === 'budget_blocked').length]);

  if (!budget) return null;

  const showSession = budget.sessionCap !== null;
  const showUser = budget.userCap !== null;
  if (!showSession && !showUser) return null;

  const blocked = events.some((e) => e.kind === 'budget_blocked');

  return (
    <div className={`text-xs ${blocked ? 'text-red-700' : 'text-gray-600'}`}>
      {showSession && (
        <span>
          {fmt(budget.sessionSpent)} / {fmt(budget.sessionCap!)} (session)
        </span>
      )}
      {showSession && showUser && <span className="mx-1">·</span>}
      {showUser && (
        <span>
          {fmt(budget.userSpent)} / {fmt(budget.userCap!)} (user)
        </span>
      )}
      {blocked && <span className="ml-2 font-medium">budget blocked</span>}
    </div>
  );
}

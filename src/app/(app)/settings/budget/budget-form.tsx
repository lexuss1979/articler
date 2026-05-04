'use client';

import { useState, type FormEvent } from 'react';
import type { BudgetSettings } from '../../../../server/settings/budget';

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'ok' } | { kind: 'error'; message: string };

type FieldState = {
  enabled: boolean;
  value: string;
};

function toFieldState(value: number | null): FieldState {
  return { enabled: value !== null, value: value === null ? '' : String(value) };
}

function parseField(field: FieldState): { ok: true; value: number | null } | { ok: false; reason: string } {
  if (!field.enabled) return { ok: true, value: null };
  const parsed = Number(field.value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, reason: 'Cap must be a non-negative number.' };
  }
  return { ok: true, value: parsed };
}

export function BudgetForm({ initial }: { initial: BudgetSettings }) {
  const [monthly, setMonthly] = useState<FieldState>(toFieldState(initial.monthlyCapUsd));
  const [session, setSession] = useState<FieldState>(toFieldState(initial.sessionCapUsd));
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const m = parseField(monthly);
    const s = parseField(session);
    if (!m.ok) {
      setStatus({ kind: 'error', message: `Lifetime: ${m.reason}` });
      return;
    }
    if (!s.ok) {
      setStatus({ kind: 'error', message: `Session: ${s.reason}` });
      return;
    }
    setStatus({ kind: 'saving' });
    const res = await fetch('/api/settings/budget', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyCapUsd: m.value, sessionCapUsd: s.value }),
    });
    if (!res.ok) {
      setStatus({ kind: 'error', message: `Save failed: HTTP ${res.status}` });
      return;
    }
    setStatus({ kind: 'ok' });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2 border rounded p-4">
        <legend className="text-sm font-medium px-2">Lifetime cap</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={monthly.enabled}
            onChange={(e) => setMonthly({ ...monthly, enabled: e.target.checked })}
          />
          Enforce a lifetime spending cap
        </label>
        {monthly.enabled && (
          <label className="flex flex-col gap-1">
            <span className="text-sm">USD</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={monthly.value}
              onChange={(e) => setMonthly({ ...monthly, value: e.target.value })}
              className="border rounded px-3 py-1.5 text-sm w-40"
            />
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2 border rounded p-4">
        <legend className="text-sm font-medium px-2">Per-session cap</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={session.enabled}
            onChange={(e) => setSession({ ...session, enabled: e.target.checked })}
          />
          Enforce a per-session spending cap
        </label>
        {session.enabled && (
          <label className="flex flex-col gap-1">
            <span className="text-sm">USD</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={session.value}
              onChange={(e) => setSession({ ...session, value: e.target.value })}
              className="border rounded px-3 py-1.5 text-sm w-40"
            />
          </label>
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status.kind === 'saving'}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
        >
          {status.kind === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {status.kind === 'ok' && <span className="text-sm text-green-700">Saved.</span>}
        {status.kind === 'error' && <span className="text-sm text-red-700">{status.message}</span>}
      </div>
    </form>
  );
}

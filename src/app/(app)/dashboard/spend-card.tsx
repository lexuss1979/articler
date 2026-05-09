import Link from 'next/link';
import type { BudgetSettings } from '../../../server/settings/budget';

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function SpendCard({
  spend,
  settings,
}: {
  spend: { lifetime: number };
  settings: BudgetSettings;
}) {
  const cap = settings.monthlyCapUsd;
  const spent = spend.lifetime;
  const pct = cap !== null && cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : null;
  const over = cap !== null && spent >= cap;

  return (
    <div className="border rounded p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Spend</h2>
        <Link href="/settings/budget" className="text-xs text-blue-600 hover:underline">
          Edit caps →
        </Link>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-gray-600">Lifetime</span>
            <span className={over ? 'text-red-700 font-medium' : 'text-gray-900'}>
              {fmt(spent)}
              {cap !== null && <span className="text-gray-500"> / {fmt(cap)}</span>}
            </span>
          </div>
          {pct !== null && (
            <div className="mt-1 h-1.5 bg-gray-100 rounded overflow-hidden">
              <div
                className={over ? 'h-full bg-red-500' : 'h-full bg-blue-500'}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        {settings.sessionCapUsd !== null && (
          <div className="text-xs text-gray-500">
            Per-session cap: {fmt(settings.sessionCapUsd)}
          </div>
        )}
        {cap === null && settings.sessionCapUsd === null && (
          <p className="text-xs text-gray-500">
            No caps set. Add them on the budget page to short-circuit
            calls before they overspend.
          </p>
        )}
      </div>
    </div>
  );
}

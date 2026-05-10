'use client';

import { useTransition } from 'react';
import type { Assertion } from '../../../../../server/profiles/profile-assertions-repo';
import { deleteAssertionAction, resetSessionAssertionsAction } from '../../actions';

type Props = {
  profileId: number;
  assertions: Assertion[];
};

function DeleteButton({
  profileId,
  assertionId,
}: {
  profileId: number;
  assertionId: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(() => deleteAssertionAction(profileId, assertionId))
      }
      className="text-xs text-red-600 hover:underline disabled:opacity-40"
    >
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}

function ResetSessionButton({
  profileId,
  sessionCount,
}: {
  profileId: number;
  sessionCount: number;
}) {
  return (
    <form action={resetSessionAssertionsAction}>
      <input type="hidden" name="profileId" value={profileId} />
      <button
        type="submit"
        disabled={sessionCount === 0}
        onClick={(e) => {
          if (
            !window.confirm(
              `Delete all ${sessionCount} assertions learned from sessions? Examples-sourced assertions are kept.`,
            )
          ) {
            e.preventDefault();
          }
        }}
        className="text-xs text-red-600 hover:underline disabled:opacity-40"
      >
        Reset session-learned
      </button>
    </form>
  );
}

export function AssertionsPanel({ profileId, assertions }: Props) {
  const sessionCount = assertions.filter((a) => a.source === 'session').length;
  const examplesCount = assertions.filter((a) => a.source === 'examples').length;
  const grouped = assertions.reduce<Record<string, Assertion[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Assertions</h2>
          <p className="text-xs text-muted-foreground">
            {sessionCount} session-learned, {examplesCount} from examples
          </p>
        </div>
        <ResetSessionButton profileId={profileId} sessionCount={sessionCount} />
      </div>
      {assertions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No assertions yet — they&apos;re learned from your sessions and examples.
        </p>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium capitalize text-muted-foreground">{category}</h3>
            {items.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border rounded p-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="truncate">{a.assertion}</p>
                  <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden w-full">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${a.confidence * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {a.evidenceCount}×
                </span>
                <DeleteButton profileId={profileId} assertionId={a.id} />
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
}

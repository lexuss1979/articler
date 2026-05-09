'use client';

import { useActionState, useState } from 'react';
import { type AnalyzeExamplesActionState, analyzeExamplesAction } from '../../actions';

type SlotKind = 'url' | 'text';

type Slot = {
  kind: SlotKind;
  value: string;
};

const SLOT_COUNT = 4;

function buildInitialSlots(): Slot[] {
  return Array.from({ length: SLOT_COUNT }, () => ({ kind: 'url', value: '' }));
}

export function ExamplesForm({ profileId }: { profileId: number }) {
  const [slots, setSlots] = useState<Slot[]>(buildInitialSlots);

  const [state, dispatch, isPending] = useActionState<AnalyzeExamplesActionState, FormData>(
    analyzeExamplesAction,
    null,
  );

  function updateSlot(index: number, patch: Partial<Slot>) {
    setSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const inputs = slots
      .filter((s) => s.value.trim() !== '')
      .map((s) => ({ kind: s.kind, value: s.value.trim() }));
    formData.set('inputs', JSON.stringify(inputs));
    dispatch(formData);
  }

  const urlErrors =
    state?.ok === true && state.urlErrors.length > 0 ? state.urlErrors : [];

  const urlErrorMap = new Map<number, string>(urlErrors.map((e) => [e.index, e.error]));

  // Map from filtered-inputs index back to slot index is tricky; instead track by
  // iterating slots in order and assigning the same index as the non-empty slots list.
  // We need to map slot positions to input positions for error display.
  const slotToInputIndex: Map<number, number> = new Map();
  let inputIdx = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].value.trim() !== '') {
      slotToInputIndex.set(i, inputIdx);
      inputIdx++;
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Examples</h2>
      <p className="text-sm text-muted-foreground">
        Provide up to four example articles (URL or pasted text) so Articler can learn your writing style.
        At least three readable examples are required.
      </p>

      {state?.ok === true && (
        <div className="border rounded p-4 bg-muted/40 flex flex-col gap-2">
          <p className="text-sm font-medium">Analysis complete</p>
          <p className="text-sm">{state.summary}</p>
          <p className="text-xs text-muted-foreground">Saved {state.savedCount} assertions.</p>
          {urlErrors.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Some URLs could not be fetched — paste the article body manually and resubmit:
            </p>
          )}
          {urlErrors.length > 0 && (
            <ul className="text-xs text-red-600 list-disc pl-4 flex flex-col gap-0.5">
              {urlErrors.map((e) => (
                <li key={e.index}>
                  Slot {e.index + 1}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state?.ok === false && state.error === 'too_few_examples' && (
        <p className="text-sm text-amber-700 border border-amber-300 bg-amber-50 rounded px-3 py-2">
          Provide at least 3 readable examples.
        </p>
      )}

      {state?.ok === false && state.error === 'profile_not_found' && (
        <p className="text-sm text-red-600 border border-red-200 rounded px-3 py-2">
          Profile not found. Please refresh and try again.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="profileId" value={profileId} />

        {slots.map((slot, i) => {
          const inputIndex = slotToInputIndex.get(i);
          const slotError = inputIndex !== undefined ? urlErrorMap.get(inputIndex) : undefined;

          return (
            <div key={i} className="border rounded p-3 flex flex-col gap-2">
              <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                Slot {i + 1}
              </div>

              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={`slot-kind-${i}`}
                    value="url"
                    checked={slot.kind === 'url'}
                    onChange={() => updateSlot(i, { kind: 'url', value: '' })}
                  />
                  URL
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={`slot-kind-${i}`}
                    value="text"
                    checked={slot.kind === 'text'}
                    onChange={() => updateSlot(i, { kind: 'text', value: '' })}
                  />
                  Pasted text
                </label>
              </div>

              {slot.kind === 'url' ? (
                <input
                  type="url"
                  placeholder="https://example.com/article"
                  value={slot.value}
                  onChange={(e) => updateSlot(i, { value: e.target.value })}
                  className="border rounded px-3 py-1.5 text-sm w-full"
                />
              ) : (
                <textarea
                  placeholder="Paste the article body here…"
                  rows={5}
                  value={slot.value}
                  onChange={(e) => updateSlot(i, { value: e.target.value })}
                  className="border rounded px-3 py-1.5 text-sm w-full resize-y"
                />
              )}

              {slotError && (
                <p className="text-xs text-red-600">Error: {slotError}</p>
              )}
            </div>
          );
        })}

        <button
          type="submit"
          disabled={isPending}
          className="self-start bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {isPending ? (
            <>
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden="true"
              />
              Analysing examples…
            </>
          ) : (
            'Analyse examples'
          )}
        </button>
      </form>
    </section>
  );
}

'use client';

import { useState } from 'react';
import type {
  ImageCandidate,
  ImagePrompt,
  ImageSlot,
} from '../../../../server/sessions/images';
import {
  selectCandidateAction,
  setSlotModeAction,
  stockSearchAction,
} from './actions';
import { ImagePromptEditor } from './image-prompt-editor';

const kindPillClass = 'bg-violet-100 text-violet-700';

export function ImageSlotCard({
  sessionId,
  slot,
  sectionTitle,
  onSlotChange,
}: {
  sessionId: number;
  slot: ImageSlot;
  sectionTitle?: string;
  onSlotChange?: (next: ImageSlot) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);

  const kindLabel =
    slot.kind === 'hero' ? 'Hero' : `Inline — ${sectionTitle ?? slot.sectionId ?? ''}`;

  async function handleMode(mode: 'generate' | 'stock') {
    setBusy('mode');
    setStockError(null);
    const result = await setSlotModeAction(sessionId, slot.id, mode);
    setBusy(null);
    if (result.ok) onSlotChange?.(result.slot);
  }

  async function handleStockSearch() {
    setBusy('stock');
    setStockError(null);
    const result = await stockSearchAction(sessionId, slot.id);
    setBusy(null);
    if (!result.ok) setStockError(result.error);
    else onSlotChange?.({ ...slot, candidates: [...slot.candidates, ...result.candidates] });
  }

  async function handleSelect(candidateId: string) {
    if (slot.chosenCandidateId === candidateId) return;
    setBusy('select');
    const result = await selectCandidateAction(sessionId, slot.id, candidateId);
    setBusy(null);
    if (result.ok) onSlotChange?.({ ...slot, chosenCandidateId: candidateId });
  }

  function handlePromptChange(prompt: ImagePrompt) {
    onSlotChange?.({ ...slot, prompt });
  }

  return (
    <div className="border rounded p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${kindPillClass}`}>
          {kindLabel}
        </span>
        {slot.chosenCandidateId && (
          <span className="text-xs text-green-600 italic">selected</span>
        )}
      </div>
      <p className="text-sm text-gray-700">{slot.brief}</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleMode('generate')}
          disabled={busy !== null}
          className={
            'text-xs px-2 py-1 rounded ' +
            (slot.mode === 'generate'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300')
          }
        >
          Generate
        </button>
        <button
          type="button"
          onClick={() => void handleMode('stock')}
          disabled={busy !== null}
          className={
            'text-xs px-2 py-1 rounded ' +
            (slot.mode === 'stock'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300')
          }
        >
          Stock
        </button>
      </div>

      {slot.mode === 'generate' && (
        <ImagePromptEditor
          sessionId={sessionId}
          slotId={slot.id}
          initialPrompt={slot.prompt}
          onPromptChange={handlePromptChange}
        />
      )}

      {slot.mode === 'stock' && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleStockSearch()}
            disabled={busy !== null}
            className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 disabled:opacity-40 self-start"
          >
            {busy === 'stock' ? 'Searching…' : 'Search Unsplash'}
          </button>
          {stockError === 'unconfigured' && (
            <p className="text-xs text-amber-700">
              Stock pathway disabled — set <code>UNSPLASH_ACCESS_KEY</code>.
            </p>
          )}
          {stockError === 'http_error' && (
            <p className="text-xs text-red-600">Unsplash request failed.</p>
          )}
        </div>
      )}

      {slot.candidates.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {slot.candidates.map((c) => (
            <CandidateThumb
              key={c.id}
              candidate={c}
              chosen={slot.chosenCandidateId === c.id}
              disabled={busy !== null || slot.chosenCandidateId === c.id}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateThumb({
  candidate,
  chosen,
  disabled,
  onSelect,
}: {
  candidate: ImageCandidate;
  chosen: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const url = candidate.thumbUrl ?? candidate.localPath;
  return (
    <button
      type="button"
      onClick={() => onSelect(candidate.id)}
      disabled={disabled}
      className={
        'relative border rounded overflow-hidden disabled:cursor-not-allowed ' +
        (chosen ? 'opacity-100 ring-2 ring-green-500' : 'opacity-90 hover:opacity-100')
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="block w-full h-24 object-cover" />
      {chosen && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-xs font-medium">
          Selected
        </span>
      )}
    </button>
  );
}

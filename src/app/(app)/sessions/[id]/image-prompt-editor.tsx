'use client';

import { useState } from 'react';
import type { ImagePrompt } from '../../../../server/sessions/images';
import {
  composePromptAction,
  prerenderSlotAction,
  savePromptAction,
} from './actions';

export function ImagePromptEditor({
  sessionId,
  slotId,
  initialPrompt,
  onPromptChange,
}: {
  sessionId: number;
  slotId: string;
  initialPrompt?: ImagePrompt;
  onPromptChange?: (prompt: ImagePrompt) => void;
}) {
  const [text, setText] = useState(
    initialPrompt ? JSON.stringify(initialPrompt, null, 2) : '',
  );
  const [trackedInitial, setTrackedInitial] = useState(initialPrompt);
  if (trackedInitial !== initialPrompt) {
    setTrackedInitial(initialPrompt);
    setText(initialPrompt ? JSON.stringify(initialPrompt, null, 2) : '');
  }
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'compose' | 'save' | 'prerender' | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleCompose() {
    setBusy('compose');
    setServerError(null);
    const result = await composePromptAction(sessionId, slotId);
    setBusy(null);
    if (result.ok) {
      setText(JSON.stringify(result.prompt, null, 2));
      setParseError(null);
      onPromptChange?.(result.prompt);
    } else {
      setServerError(result.error);
    }
  }

  async function handleSave() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'invalid JSON');
      return;
    }
    setParseError(null);
    setBusy('save');
    setServerError(null);
    const result = await savePromptAction(sessionId, slotId, parsed);
    setBusy(null);
    if (result.ok) {
      onPromptChange?.(result.prompt);
    } else {
      setServerError(result.error);
    }
  }

  async function handlePrerender() {
    setBusy('prerender');
    setServerError(null);
    const result = await prerenderSlotAction(sessionId, slotId);
    setBusy(null);
    if (!result.ok) setServerError(result.error);
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="text-xs font-mono border rounded p-2 w-full"
        placeholder='{ "subject": "...", "style": "...", ... }'
      />
      {parseError && (
        <p className="text-xs text-red-600">JSON parse error: {parseError}</p>
      )}
      {serverError && (
        <p className="text-xs text-red-600">Server error: {serverError}</p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => void handleCompose()}
          disabled={busy !== null}
          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-40"
        >
          {busy === 'compose' ? 'Composing…' : 'Compose prompt'}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy !== null || text.trim().length === 0}
          className="text-xs bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-800 disabled:opacity-40"
        >
          {busy === 'save' ? 'Saving…' : 'Save prompt'}
        </button>
        <button
          type="button"
          onClick={() => void handlePrerender()}
          disabled={busy !== null || text.trim().length === 0}
          className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 disabled:opacity-40"
        >
          {busy === 'prerender' ? 'Generating…' : 'Prerender'}
        </button>
      </div>
    </div>
  );
}

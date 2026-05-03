'use client';

import { useState } from 'react';
import { finishExportAction, startSessionAction } from './actions';

const FORMATS = [
  { fmt: 'md', label: 'Markdown (.zip)' },
  { fmt: 'html', label: 'HTML (.zip)' },
  { fmt: 'docx', label: 'DOCX' },
  { fmt: 'pdf', label: 'PDF' },
] as const;

export function ExportPane(props: {
  sessionId: number;
  state: 'export' | 'done';
  previewHtml?: string | null;
}) {
  const { sessionId, state, previewHtml } = props;
  const [finishing, setFinishing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  async function handleFinish() {
    setFinishing(true);
    setFinishError(null);
    const result = await finishExportAction(sessionId);
    if (!result.ok) {
      setFinishing(false);
      setFinishError(result.error);
    }
  }

  async function handleResume() {
    setResuming(true);
    setFinishError(null);
    try {
      await startSessionAction(sessionId);
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {previewHtml ? (
        <div className="flex-1 min-h-0 border rounded overflow-hidden bg-white">
          <iframe
            title="Article preview"
            srcDoc={previewHtml}
            sandbox="allow-same-origin"
            className="w-full h-full min-h-[60vh]"
          />
        </div>
      ) : null}

      <div className="shrink-0 flex flex-col gap-2">
        <h3 className="text-sm font-medium text-gray-700">Download</h3>
        <div className="grid grid-cols-2 gap-2">
          {FORMATS.map(({ fmt, label }) => (
            <a
              key={fmt}
              href={`/api/sessions/${sessionId}/export?format=${fmt}`}
              download
              className="border rounded px-3 py-2 text-sm text-center hover:bg-gray-50"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="shrink-0 flex flex-col gap-2 pt-2 border-t">
        {state === 'done' ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Article complete.
          </p>
        ) : (
          <>
            <button
              onClick={() => void handleFinish()}
              disabled={finishing}
              className="w-full bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-40"
            >
              {finishing ? 'Marking…' : 'Mark as done'}
            </button>
            {finishError === 'no_pending_export' && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-amber-700">
                  Runner is not parked for this session. Click Resume, then try Mark as done again.
                </p>
                <button
                  onClick={() => void handleResume()}
                  disabled={resuming}
                  className="text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 self-start"
                >
                  {resuming ? 'Resuming…' : 'Resume runner'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

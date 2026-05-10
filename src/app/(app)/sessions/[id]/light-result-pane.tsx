'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { revertToPreReviewAction } from './actions';
import type { ClaimWithVerdict } from './factcheck-tab';

const FORMATS = [
  { fmt: 'md', label: 'Markdown (.zip)' },
  { fmt: 'html', label: 'HTML (.zip)' },
  { fmt: 'docx', label: 'DOCX' },
  { fmt: 'pdf', label: 'PDF' },
] as const;

export function LightResultPane({
  sessionId,
  draftMd,
  previewHtml,
  draftMdPreReview,
  claimsWithVerdicts = [],
}: {
  sessionId: number;
  draftMd: string;
  previewHtml: string | null;
  draftMdPreReview: string | null;
  claimsWithVerdicts?: ClaimWithVerdict[];
}) {
  const [copied, setCopied] = useState(false);
  const [reverting, setReverting] = useState(false);
  const router = useRouter();

  function handleCopy() {
    void navigator.clipboard.writeText(draftMd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div data-slot="hero-image" className="border rounded p-6 text-center bg-gray-50">
        <p className="text-sm text-gray-400">Hero image generating…</p>
      </div>

      {previewHtml ? (
        <div className="border rounded overflow-hidden bg-white">
          <iframe
            title="Article preview"
            srcDoc={previewHtml}
            sandbox="allow-same-origin"
            className="w-full min-h-[60vh]"
          />
        </div>
      ) : (
        <p className="text-sm text-gray-400">No article yet</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
        >
          {copied ? 'Copied!' : 'Copy markdown'}
        </button>

        <button
          type="button"
          disabled={draftMdPreReview == null || reverting}
          title={draftMdPreReview == null ? 'Pre-review snapshot not available' : undefined}
          className="border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
          onClick={() => {
            if (reverting) return;
            setReverting(true);
            void revertToPreReviewAction(sessionId).then((result) => {
              if (result.ok) router.refresh();
            }).finally(() => setReverting(false));
          }}
        >
          {reverting ? 'Reverting…' : 'Revert to pre-review'}
        </button>

        {FORMATS.map(({ fmt, label }) => (
          <a
            key={fmt}
            href={`/api/sessions/${sessionId}/export?format=${fmt}`}
            download
            className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
          >
            {label}
          </a>
        ))}
      </div>

      <div data-slot="claims-panel" className="border rounded p-4 bg-gray-50">
        <p className="text-sm text-gray-400">Claims will appear here once extracted.</p>
      </div>
    </div>
  );
}

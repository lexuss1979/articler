'use client';

import { useRef, useState, useTransition } from 'react';
import { regenerateSectionAction } from './actions';
import type { Plan, PlanSection } from '../../../../server/sessions/plan';

export function SectionCard({
  plan,
  section,
  contentMd,
  sessionId,
}: {
  plan: Plan;
  section: PlanSection;
  contentMd: string | null;
  sessionId: number;
}) {
  void plan;
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleRegenerate() {
    const instruction = textareaRef.current?.value ?? '';
    startTransition(async () => {
      await regenerateSectionAction(sessionId, section.id, instruction);
    });
  }

  return (
    <div className="border rounded p-4 flex flex-col gap-2">
      <div>
        <h4 className="font-semibold text-sm">{section.title}</h4>
        <p className="text-xs text-gray-500">{section.intent}</p>
      </div>

      {contentMd ? (
        <pre className="bg-gray-50 rounded p-3 text-xs whitespace-pre-wrap overflow-auto max-h-64">
          {contentMd}
        </pre>
      ) : (
        <p className="text-xs text-gray-400 italic">Drafting…</p>
      )}

      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-blue-500 hover:underline"
        >
          {open ? 'Hide regenerate' : 'Regenerate'}
        </button>
        {open && (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              name="instruction"
              maxLength={1000}
              placeholder="Optional instruction…"
              className="w-full border rounded p-2 text-xs resize-y"
              rows={3}
            />
            <button
              onClick={handleRegenerate}
              disabled={isPending}
              className="self-start bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-xs px-3 py-1.5 rounded"
            >
              {isPending ? 'Regenerating…' : 'Regenerate section'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import type { Plan } from '../../../../server/sessions/plan';
import { savePlanEditsAction } from './actions';

export function PlanEditor({ plan: initialPlan, sessionId }: { plan: Plan; sessionId: number }) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function scheduleSave(updated: Plan) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void savePlanEditsAction(sessionId, updated);
    }, 500);
  }

  function updateField<K extends keyof Plan>(key: K, value: Plan[K]) {
    const updated = { ...plan, [key]: value };
    setPlan(updated);
    scheduleSave(updated);
  }

  function updateSection(index: number, field: string, value: unknown) {
    const sections = plan.sections.map((s, i) =>
      i === index ? { ...s, [field]: value } : s,
    );
    const updated = { ...plan, sections };
    setPlan(updated);
    scheduleSave(updated);
  }

  function updateKeyPoint(sectionIndex: number, pointIndex: number, value: string) {
    const sections = plan.sections.map((s, i) => {
      if (i !== sectionIndex) return s;
      const keyPoints = s.keyPoints.map((kp, j) => (j === pointIndex ? value : kp));
      return { ...s, keyPoints };
    });
    const updated = { ...plan, sections };
    setPlan(updated);
    scheduleSave(updated);
  }

  function addKeyPoint(sectionIndex: number) {
    const sections = plan.sections.map((s, i) =>
      i === sectionIndex ? { ...s, keyPoints: [...s.keyPoints, ''] } : s,
    );
    const updated = { ...plan, sections };
    setPlan(updated);
    scheduleSave(updated);
  }

  function removeKeyPoint(sectionIndex: number, pointIndex: number) {
    const sections = plan.sections.map((s, i) => {
      if (i !== sectionIndex) return s;
      return { ...s, keyPoints: s.keyPoints.filter((_, j) => j !== pointIndex) };
    });
    const updated = { ...plan, sections };
    setPlan(updated);
    scheduleSave(updated);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Thesis</label>
        <textarea
          rows={2}
          value={plan.thesis}
          onChange={(e) => updateField('thesis', e.target.value)}
          className="border rounded px-3 py-2 text-sm resize-y"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Target takeaway
        </label>
        <textarea
          rows={2}
          value={plan.targetTakeaway}
          onChange={(e) => updateField('targetTakeaway', e.target.value)}
          className="border rounded px-3 py-2 text-sm resize-y"
        />
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sections</p>
        {plan.sections.map((section, si) => (
          <div key={section.id} className="border rounded p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-mono w-6 shrink-0">{si + 1}</span>
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSection(si, 'title', e.target.value)}
                className="flex-1 border rounded px-2 py-1 text-sm font-medium"
                placeholder="Section title"
              />
              <input
                type="number"
                value={section.expectedLength}
                min={1}
                onChange={(e) => updateSection(si, 'expectedLength', Number(e.target.value))}
                className="w-24 border rounded px-2 py-1 text-sm text-right"
                placeholder="Words"
              />
              <span className="text-xs text-gray-400">words</span>
            </div>

            <textarea
              rows={2}
              value={section.intent}
              onChange={(e) => updateSection(si, 'intent', e.target.value)}
              className="border rounded px-3 py-2 text-sm resize-y"
              placeholder="Section intent"
            />

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Key points</span>
              {section.keyPoints.map((kp, pi) => (
                <div key={pi} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={kp}
                    onChange={(e) => updateKeyPoint(si, pi, e.target.value)}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                    placeholder="Key point"
                  />
                  <button
                    type="button"
                    onClick={() => removeKeyPoint(si, pi)}
                    className="text-gray-400 hover:text-red-500 text-lg leading-none"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addKeyPoint(si)}
                className="self-start text-xs text-blue-600 hover:underline mt-1"
              >
                + Add point
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

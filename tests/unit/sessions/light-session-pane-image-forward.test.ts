import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/app/(app)/sessions/[id]/actions', () => ({
  submitBriefAction: vi.fn(),
  submitClarificationAction: vi.fn(),
  revertToPreReviewAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('../../../src/app/(app)/sessions/[id]/light-result-pane', () => ({
  LightResultPane: ({ initialImageState }: { initialImageState?: { slots: unknown[] } }) =>
    React.createElement('div', {
      'data-testid': 'light-result-pane',
      'data-slot-count': String(initialImageState?.slots.length ?? 0),
    }),
}));

import { LightSessionPane } from '../../../src/app/(app)/sessions/[id]/light-session-pane';

describe('<LightSessionPane /> initialImageState forwarding', () => {
  it('passes initialImageState to LightResultPane in done state', () => {
    const initialImageState = {
      slots: [
        {
          id: 's_hero_1',
          kind: 'hero' as const,
          brief: 'A brief',
          mode: 'generate' as const,
          candidates: [],
          chosenCandidateId: 'c_1',
        },
      ],
    };
    const html = renderToString(
      React.createElement(LightSessionPane, {
        sessionId: 7,
        state: 'done',
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: null,
        isRewrite: false,
        initialImageState,
      }),
    );
    expect(html).toContain('data-testid="light-result-pane"');
    expect(html).toContain('data-slot-count="1"');
  });

  it('passes default empty slots when initialImageState is omitted', () => {
    const html = renderToString(
      React.createElement(LightSessionPane, {
        sessionId: 7,
        state: 'done',
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: null,
        isRewrite: false,
      }),
    );
    expect(html).toContain('data-slot-count="0"');
  });
});

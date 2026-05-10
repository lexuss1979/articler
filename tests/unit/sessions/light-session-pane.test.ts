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

import { LightSessionPane } from '../../../src/app/(app)/sessions/[id]/light-session-pane';

const BASE_PROPS = {
  sessionId: 7,
  draftMd: '',
  previewHtml: null,
  draftMdPreReview: null,
  isRewrite: false as const,
};

describe('<LightSessionPane />', () => {
  it('renders LightBriefForm (topic input) when state is briefing', () => {
    const html = renderToString(
      React.createElement(LightSessionPane, { ...BASE_PROPS, state: 'briefing' }),
    );
    expect(html).toContain('name="topic"');
  });

  it('renders Researching sources… when state is research', () => {
    const html = renderToString(
      React.createElement(LightSessionPane, { ...BASE_PROPS, state: 'research' }),
    );
    expect(html).toContain('Researching sources…');
  });

  it('renders hero-image slot and format=md link when state is done with previewHtml', () => {
    const html = renderToString(
      React.createElement(LightSessionPane, {
        ...BASE_PROPS,
        state: 'done',
        previewHtml: '<p>x</p>',
        draftMdPreReview: null,
      }),
    );
    expect(html).toContain('data-slot="hero-image"');
    expect(html).toContain('format=md');
  });

  it('renders Unexpected state: decoration for decoration state', () => {
    const html = renderToString(
      React.createElement(LightSessionPane, { ...BASE_PROPS, state: 'decoration' }),
    );
    expect(html).toContain('Unexpected state: decoration');
  });
});

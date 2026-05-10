import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('../../../src/app/(app)/sessions/[id]/actions', () => ({
  revertToPreReviewAction: vi.fn(),
}));

import { LightResultPane } from '../../../src/app/(app)/sessions/[id]/light-result-pane';

describe('<LightResultPane />', () => {
  it('renders hero-image slot, claims-panel slot, iframe, disabled revert button, and export links when previewHtml is set and draftMdPreReview is null', () => {
    const html = renderToString(
      React.createElement(LightResultPane, {
        sessionId: 42,
        draftMd: '# Hello',
        previewHtml: '<p>hi</p>',
        draftMdPreReview: null,
      }),
    );
    expect(html).toContain('data-slot="hero-image"');
    expect(html).toContain('data-slot="claims-panel"');
    expect(html).toContain('<iframe');
    expect(html).toContain('srcDoc=');
    expect(html).toContain('title="Article preview"');
    expect(html).toContain('Revert to pre-review');
    expect(html).toContain('disabled=""');
    expect(html).toContain('href="/api/sessions/42/export?format=md"');
    expect(html).toContain('href="/api/sessions/42/export?format=pdf"');
  });

  it('renders fallback text and no iframe when previewHtml is null', () => {
    const html = renderToString(
      React.createElement(LightResultPane, {
        sessionId: 42,
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: null,
      }),
    );
    expect(html).toContain('No article yet');
    expect(html).not.toContain('<iframe');
  });

  it('renders revert button without disabled when draftMdPreReview is set', () => {
    const html = renderToString(
      React.createElement(LightResultPane, {
        sessionId: 42,
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: 'old text',
      }),
    );
    expect(html).toContain('Revert to pre-review');
    expect(html).not.toContain('disabled=""');
  });
});

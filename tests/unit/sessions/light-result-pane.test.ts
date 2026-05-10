import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('../../../src/app/(app)/sessions/[id]/actions', () => ({
  revertToPreReviewAction: vi.fn(),
  getClaimVerdictAction: vi.fn(),
  verifyClaimAction: vi.fn(),
  verifyAllClaimsAction: vi.fn(),
}));

vi.mock('../../../src/app/(app)/sessions/[id]/use-session-events', () => ({
  useSessionEvents: vi.fn(() => []),
}));

import { LightResultPane } from '../../../src/app/(app)/sessions/[id]/light-result-pane';
import { useSessionEvents } from '../../../src/app/(app)/sessions/[id]/use-session-events';

function makeClaimWithVerdict(id: number, verdictStr: string | null = null) {
  const claim = {
    id,
    sessionId: 10,
    roundId: 99,
    spanHash: `hash-${id}`,
    claimText: `Claim text ${id}`,
    claimType: 'statistic',
    checkWorthiness: 'high',
    span: { sectionId: 'full', charStart: 0, charEnd: 5, text: 'hello' },
    status: 'open',
    createdAt: new Date(),
  };
  const verdict = verdictStr
    ? { id: 100 + id, claimId: id, verdict: verdictStr, justification: 'Some justification', createdAt: new Date() }
    : null;
  return { claim, verdict };
}

beforeEach(() => {
  vi.mocked(useSessionEvents).mockReturnValue([]);
});

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

  it('renders placeholder when claimsWithVerdicts is empty', () => {
    const html = renderToString(
      React.createElement(LightResultPane, {
        sessionId: 42,
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: null,
        claimsWithVerdicts: [],
      }),
    );
    expect(html).toContain('Claims will appear here once extracted.');
    expect(html).not.toContain('Claims to verify');
  });

  it('renders <img> when initialImageState has a hero slot with a matching chosenCandidateId; no generating text', () => {
    const initialImageState = {
      slots: [
        {
          id: 's_hero_1',
          kind: 'hero' as const,
          brief: 'A brief',
          mode: 'generate' as const,
          candidates: [
            { id: 'c_1', source: 'generated' as const, localPath: '/api/images/1/s/c_1.png', createdAt: 'x' },
          ],
          chosenCandidateId: 'c_1',
        },
      ],
    };
    const html = renderToString(
      React.createElement(LightResultPane, {
        sessionId: 42,
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: null,
        initialImageState,
      }),
    );
    expect(html).toContain('<img');
    expect(html).toContain('src="/api/images/1/s/c_1.png"');
    expect(html).not.toContain('generating');
  });

  it('renders generating text when initialImageState has no slots', () => {
    const html = renderToString(
      React.createElement(LightResultPane, {
        sessionId: 42,
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: null,
        initialImageState: { slots: [] },
      }),
    );
    expect(html).toContain('Hero image generating…');
  });

  it('renders <img> when useSessionEvents returns a hero_image artifact_updated event', () => {
    vi.mocked(useSessionEvents).mockReturnValue([
      { kind: 'artifact_updated', payload: { kind: 'hero_image', url: '/api/images/1/s/c_x.png', candidateId: 'c_x' } },
    ]);
    const html = renderToString(
      React.createElement(LightResultPane, {
        sessionId: 42,
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: null,
      }),
    );
    expect(html).toContain('<img');
    expect(html).toContain('src="/api/images/1/s/c_x.png"');
  });

  it('renders failure text when useSessionEvents returns a hero_image_failed event', () => {
    vi.mocked(useSessionEvents).mockReturnValue([
      { kind: 'artifact_updated', payload: { kind: 'hero_image_failed', reason: 'budget_exceeded' } },
    ]);
    const html = renderToString(
      React.createElement(LightResultPane, {
        sessionId: 42,
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: null,
      }),
    );
    expect(html).toContain('Hero image failed (budget_exceeded)');
  });

  it('renders both claim texts, a verdict pill for the verified one, and Verify button for the pending one', () => {
    const html = renderToString(
      React.createElement(LightResultPane, {
        sessionId: 42,
        draftMd: '',
        previewHtml: null,
        draftMdPreReview: null,
        claimsWithVerdicts: [
          makeClaimWithVerdict(1, 'verified'),
          makeClaimWithVerdict(2, null),
        ],
      }),
    );
    expect(html).toContain('Claim text 1');
    expect(html).toContain('Claim text 2');
    expect(html).toContain('bg-green-100');
    expect(html).toContain('Verify');
    expect(html).toContain('Claims to verify');
    expect(html).toContain('Verify all');
  });
});

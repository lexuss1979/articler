import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LightClaimCard } from '../../../src/app/(app)/sessions/[id]/light-claim-card';

const claim = {
  id: 1,
  sessionId: 10,
  roundId: 99,
  spanHash: 'abc',
  claimText: 'The sky is blue.',
  claimType: 'statistic',
  checkWorthiness: 'high',
  span: { sectionId: 'full', charStart: 0, charEnd: 10, text: 'The sky is blue.' },
  status: 'open',
  createdAt: new Date(),
};

const verifiedVerdict = {
  id: 5,
  claimId: 1,
  verdict: 'verified',
  justification: 'OK',
  createdAt: new Date(),
};

const contradictedVerdict = {
  id: 6,
  claimId: 1,
  verdict: 'contradicted',
  justification: 'No',
  createdAt: new Date(),
};

describe('<LightClaimCard />', () => {
  it('renders Pending verify pill and Verify button when verdict is null', () => {
    const html = renderToString(
      React.createElement(LightClaimCard, {
        claim,
        verdict: null,
        verifying: false,
        onVerify: vi.fn(),
      }),
    );
    expect(html).toContain('Pending verify');
    expect(html).toContain('Verify');
  });

  it('renders disabled Verifying… button when verdict is null and verifying is true', () => {
    const html = renderToString(
      React.createElement(LightClaimCard, {
        claim,
        verdict: null,
        verifying: true,
        onVerify: vi.fn(),
      }),
    );
    expect(html).toContain('disabled');
    expect(html).toContain('Verifying…');
  });

  it('renders verified verdict with bg-green-100 and no Verify button', () => {
    const html = renderToString(
      React.createElement(LightClaimCard, {
        claim,
        verdict: verifiedVerdict,
        verifying: false,
        onVerify: vi.fn(),
      }),
    );
    expect(html).toContain('bg-green-100');
    expect(html).not.toContain('Verify');
  });

  it('renders contradicted verdict with bg-red-100', () => {
    const html = renderToString(
      React.createElement(LightClaimCard, {
        claim,
        verdict: contradictedVerdict,
        verifying: false,
        onVerify: vi.fn(),
      }),
    );
    expect(html).toContain('bg-red-100');
  });
});

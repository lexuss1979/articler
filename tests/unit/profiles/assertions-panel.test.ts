import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/app/(app)/profiles/actions', () => ({
  deleteAssertionAction: vi.fn(),
  resetSessionAssertionsAction: vi.fn(),
}));

import { AssertionsPanel } from '../../../src/app/(app)/profiles/[id]/edit/assertions-panel';
import type { Assertion } from '../../../src/server/profiles/profile-assertions-repo';

function assertion(partial: Partial<Assertion> & Pick<Assertion, 'id' | 'key' | 'source'>): Assertion {
  return {
    profileId: 99,
    category: 'tone',
    assertion: `assertion ${partial.id}`,
    confidence: 0.7,
    evidenceCount: 2,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...partial,
  } as Assertion;
}

function normalize(html: string): string {
  return html.replace(/<!-- -->/g, '');
}

function resetButtonDisabled(html: string): boolean {
  const match = html.match(/<button[^>]*type="submit"[^>]*>Reset session-learned<\/button>/);
  if (!match) throw new Error('reset button not found');
  return / disabled[=> ]/.test(match[0]);
}

describe('<AssertionsPanel />', () => {
  it('shows session/examples counts and an enabled reset button when session rows exist', () => {
    const assertions: Assertion[] = [
      assertion({ id: 1, key: 's1', source: 'session' }),
      assertion({ id: 2, key: 's2', source: 'session' }),
      assertion({ id: 3, key: 'e1', source: 'examples' }),
    ];
    const html = renderToString(
      React.createElement(AssertionsPanel, { profileId: 99, assertions }),
    );
    expect(normalize(html)).toContain('2 session-learned, 1 from examples');
    expect(html).toContain('Reset session-learned');
    expect(resetButtonDisabled(html)).toBe(false);
  });

  it('disables the reset button when there are no session rows', () => {
    const assertions: Assertion[] = [
      assertion({ id: 3, key: 'e1', source: 'examples' }),
    ];
    const html = renderToString(
      React.createElement(AssertionsPanel, { profileId: 99, assertions }),
    );
    expect(normalize(html)).toContain('0 session-learned, 1 from examples');
    expect(resetButtonDisabled(html)).toBe(true);
  });

  it('renders zero counts and a disabled reset button when assertions list is empty', () => {
    const html = renderToString(
      React.createElement(AssertionsPanel, { profileId: 99, assertions: [] }),
    );
    expect(normalize(html)).toContain('0 session-learned, 0 from examples');
    expect(html).toContain('Reset session-learned');
    expect(resetButtonDisabled(html)).toBe(true);
    expect(html).toContain('No assertions yet');
  });
});

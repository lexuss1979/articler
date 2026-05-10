import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/app/(app)/sessions/[id]/actions', () => ({
  submitBriefAction: vi.fn(),
}));

import { LightBriefForm } from '../../../src/app/(app)/sessions/[id]/light-brief-form';

describe('<LightBriefForm />', () => {
  it('renders topic input with required and maxLength, and Start writing button', () => {
    const html = renderToString(
      React.createElement(LightBriefForm, { sessionId: 7 }),
    );
    expect(html).toContain('name="topic"');
    expect(html).toContain('required');
    expect(html).toContain('maxLength="200"');
    expect(html).toContain('Start writing');
  });

  it('does not render goal, notes, or sourceArticles fields', () => {
    const html = renderToString(
      React.createElement(LightBriefForm, { sessionId: 7 }),
    );
    expect(html).not.toContain('name="goal"');
    expect(html).not.toContain('name="notes"');
    expect(html).not.toContain('sourceArticles');
  });
});

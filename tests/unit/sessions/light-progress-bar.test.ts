import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LightProgressBar } from '../../../src/app/(app)/sessions/[id]/light-progress-bar';

describe('<LightProgressBar />', () => {
  it('renders Researching sources… and animate-spin for research state', () => {
    const html = renderToString(
      React.createElement(LightProgressBar, { state: 'research' }),
    );
    expect(html).toContain('Researching sources…');
    expect(html).toContain('animate-spin');
  });

  it('renders Writing draft… for drafting state', () => {
    const html = renderToString(
      React.createElement(LightProgressBar, { state: 'drafting' }),
    );
    expect(html).toContain('Writing draft…');
  });

  it('renders Reviewing draft… for review state', () => {
    const html = renderToString(
      React.createElement(LightProgressBar, { state: 'review' }),
    );
    expect(html).toContain('Reviewing draft…');
  });

  it('renders Planning… for planning state', () => {
    const html = renderToString(
      React.createElement(LightProgressBar, { state: 'planning' }),
    );
    expect(html).toContain('Planning…');
  });
});

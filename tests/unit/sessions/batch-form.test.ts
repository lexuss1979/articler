import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useActionState: vi.fn((_action: unknown, init: unknown) => [init, vi.fn(), false]),
  };
});

vi.mock(
  '../../../src/app/(app)/sessions/batch/actions',
  () => ({
    createBatchAction: vi.fn(),
  }),
);

import { BatchForm } from '../../../src/app/(app)/sessions/batch/new/batch-form';

describe('<BatchForm />', () => {
  const profiles = [{ id: 1, name: 'My Profile' }];

  it('renders textarea, profile select, and submit button in initial state', () => {
    const html = renderToString(
      React.createElement(BatchForm, { profiles }),
    );

    expect(html).toContain('name="topics"');
    expect(html).toContain('name="profileId"');
    expect(html).toContain('My Profile');
    expect(html).toContain('Create batch');
  });

  it('shows daily session cap error banner with current/cap numbers', () => {
    vi.mocked(React.useActionState).mockReturnValue([
      {
        ok: false as const,
        error: 'daily_session_cap_exceeded' as const,
        details: { current: 99, cap: 100, requested: 5 },
      },
      vi.fn(),
      false,
    ]);

    const html = renderToString(
      React.createElement(BatchForm, { profiles }),
    );

    expect(html.toLowerCase()).toContain('daily session cap');
    expect(html).toContain('99');
    expect(html).toContain('100');
  });

  it('shows no_topics error banner mentioning "no topics"', () => {
    vi.mocked(React.useActionState).mockReturnValue([
      { ok: false as const, error: 'no_topics' as const },
      vi.fn(),
      false,
    ]);

    const html = renderToString(
      React.createElement(BatchForm, { profiles }),
    );

    expect(html.toLowerCase()).toContain('no topics');
  });
});

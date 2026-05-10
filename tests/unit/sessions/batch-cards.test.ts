import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '../../../src/app/(app)/sessions/batch/[batchId]/use-batch-events',
  () => ({
    useBatchEvents: vi.fn(() => []),
  }),
);

import { BatchCards } from '../../../src/app/(app)/sessions/batch/[batchId]/batch-cards';
import { useBatchEvents } from '../../../src/app/(app)/sessions/batch/[batchId]/use-batch-events';

beforeEach(() => {
  vi.mocked(useBatchEvents).mockReturnValue([]);
});

describe('<BatchCards />', () => {
  it('renders topic and Queued badge for queued session, Done badge + preview for done session', () => {
    const longDraft = 'hello world '.repeat(40);
    const html = renderToString(
      React.createElement(BatchCards, {
        batchId: 5,
        initialSessions: [
          { id: 1, topic: 't1', state: 'queued', draftMd: null },
          { id: 2, topic: 't2', state: 'done', draftMd: longDraft },
        ],
      }),
    );

    expect(html).toContain('t1');
    expect(html).toContain('Queued');
    expect(html).toContain('t2');
    expect(html).toContain('Done');
    expect(html).toContain('href="/sessions/2"');

    const previewMatch = html.match(/hello world[\s\S]{0,220}…/);
    expect(previewMatch).not.toBeNull();
    const previewText = previewMatch![0];
    expect(previewText.length).toBeLessThanOrEqual(205);
  });

  it('renders Failed badge in red for failed session', () => {
    const html = renderToString(
      React.createElement(BatchCards, {
        batchId: 5,
        initialSessions: [{ id: 3, topic: 'fail-topic', state: 'failed', draftMd: null }],
      }),
    );

    expect(html).toContain('fail-topic');
    expect(html).toContain('Failed');
    expect(html).toContain('text-red-600');
  });

  it('shows Running badge when event updates state to planning', () => {
    vi.mocked(useBatchEvents).mockReturnValue([
      { sessionId: 1, state: 'planning' },
    ]);

    const html = renderToString(
      React.createElement(BatchCards, {
        batchId: 5,
        initialSessions: [{ id: 1, topic: 't1', state: 'queued', draftMd: null }],
      }),
    );

    expect(html).toContain('Running');
    expect(html).toContain('planning');
    expect(html).not.toContain('Queued');
  });

  it('includes href link to /sessions/<id> for each card', () => {
    const html = renderToString(
      React.createElement(BatchCards, {
        batchId: 5,
        initialSessions: [{ id: 7, topic: 'article', state: 'queued', draftMd: null }],
      }),
    );

    expect(html).toContain('href="/sessions/7"');
  });

  it('shows failed reason when event carries reason', () => {
    vi.mocked(useBatchEvents).mockReturnValue([
      { sessionId: 1, state: 'failed', reason: 'budget_exceeded' },
    ]);

    const html = renderToString(
      React.createElement(BatchCards, {
        batchId: 5,
        initialSessions: [{ id: 1, topic: 'budget-topic', state: 'planning', draftMd: null }],
      }),
    );

    expect(html).toContain('Failed');
    expect(html).toContain('budget_exceeded');
  });

  it('draftMd preview is at most 200 chars + ellipsis', () => {
    const draft = 'x'.repeat(500);
    const html = renderToString(
      React.createElement(BatchCards, {
        batchId: 5,
        initialSessions: [{ id: 1, topic: 'long', state: 'done', draftMd: draft }],
      }),
    );

    const start = html.indexOf('x'.repeat(5));
    expect(start).toBeGreaterThan(-1);
    const segment = html.slice(start, start + 210);
    expect(segment).toContain('…');
    expect(segment.indexOf('…')).toBeLessThanOrEqual(202);
  });
});

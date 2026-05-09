import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/app/(app)/sessions/[id]/actions', () => ({
  finishExportAction: vi.fn(),
  startSessionAction: vi.fn(),
}));

import { ExportPane } from '../../../src/app/(app)/sessions/[id]/export-pane';

describe('<ExportPane />', () => {
  it('renders four download links and the Mark as done button when state="export"', () => {
    const html = renderToString(
      React.createElement(ExportPane, { sessionId: 42, state: 'export' }),
    );
    expect(html).toContain('href="/api/sessions/42/export?format=md"');
    expect(html).toContain('href="/api/sessions/42/export?format=html"');
    expect(html).toContain('href="/api/sessions/42/export?format=docx"');
    expect(html).toContain('href="/api/sessions/42/export?format=pdf"');
    expect(html).toContain('Markdown (.zip)');
    expect(html).toContain('HTML (.zip)');
    expect(html).toContain('DOCX');
    expect(html).toContain('PDF');
    expect(html).toContain('Mark as done');
    expect(html).not.toContain('Article complete.');
  });

  it('shows the Article complete banner instead of the button when state="done"', () => {
    const html = renderToString(
      React.createElement(ExportPane, { sessionId: 42, state: 'done' }),
    );
    expect(html).toContain('Article complete.');
    expect(html).not.toContain('Mark as done');
    expect(html).toContain('href="/api/sessions/42/export?format=md"');
    expect(html).toContain('href="/api/sessions/42/export?format=pdf"');
  });

  it('renders an iframe preview when previewHtml is passed', () => {
    const previewHtml = '<!doctype html><html><body><h1>Hi</h1></body></html>';
    const html = renderToString(
      React.createElement(ExportPane, {
        sessionId: 42,
        state: 'export',
        previewHtml,
      }),
    );
    expect(html).toContain('<iframe');
    expect(html).toContain('title="Article preview"');
    expect(html).toContain('sandbox="allow-same-origin"');
    expect(html).toContain('srcDoc=');
    expect(html).toContain('&lt;h1&gt;Hi&lt;/h1&gt;');
  });

  it('does not render an iframe when previewHtml is missing or null', () => {
    const html = renderToString(
      React.createElement(ExportPane, { sessionId: 42, state: 'export' }),
    );
    expect(html).not.toContain('<iframe');

    const htmlNull = renderToString(
      React.createElement(ExportPane, {
        sessionId: 42,
        state: 'export',
        previewHtml: null,
      }),
    );
    expect(htmlNull).not.toContain('<iframe');
  });
});

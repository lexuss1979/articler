import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUserFn: vi.fn(),
  getSessionFn: vi.fn(),
  getProfileFn: vi.fn(),
  renderMarkdownArticleFn: vi.fn(),
  renderHtmlArticleFn: vi.fn(),
  renderDocxArticleFn: vi.fn(),
  renderPdfArticleFn: vi.fn(),
  buildZipBundleFn: vi.fn(),
  buildAttributionsReadmeFn: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: mocks.requireUserFn,
}));
vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
}));
vi.mock('../../../src/server/profiles/repo', () => ({
  getProfile: mocks.getProfileFn,
}));
vi.mock('../../../src/server/export/markdown', () => ({
  renderMarkdownArticle: mocks.renderMarkdownArticleFn,
}));
vi.mock('../../../src/server/export/html', () => ({
  renderHtmlArticle: mocks.renderHtmlArticleFn,
}));
vi.mock('../../../src/server/export/docx', () => ({
  renderDocxArticle: mocks.renderDocxArticleFn,
}));
vi.mock('../../../src/server/export/pdf', () => ({
  renderPdfArticle: mocks.renderPdfArticleFn,
}));
vi.mock('../../../src/server/export/bundle', () => ({
  buildZipBundle: mocks.buildZipBundleFn,
  buildAttributionsReadme: mocks.buildAttributionsReadmeFn,
}));

const SESSION_ROW = {
  id: 10,
  userId: 1,
  profileId: 5,
  state: 'export',
  draftMd: '# Title\n\nBody.',
  images: { slots: [] },
};
const PROFILE_ROW = { id: 5, userId: 1, markupRules: {} };

beforeEach(() => {
  mocks.requireUserFn.mockResolvedValue({ id: 1, email: 'u@test.com' });
  mocks.getSessionFn.mockResolvedValue(SESSION_ROW);
  mocks.getProfileFn.mockResolvedValue(PROFILE_ROW);
  mocks.renderMarkdownArticleFn.mockResolvedValue({
    contentMd: '# Title\n\nBody.',
    attachments: [],
  });
  mocks.renderHtmlArticleFn.mockResolvedValue('<html><body>Body.</body></html>');
  mocks.renderDocxArticleFn.mockResolvedValue(
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xde, 0xad]),
  );
  mocks.renderPdfArticleFn.mockResolvedValue(Buffer.from('%PDF-1.7\nfake'));
  mocks.buildZipBundleFn.mockResolvedValue(
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xbe, 0xef]),
  );
  mocks.buildAttributionsReadmeFn.mockReturnValue('No external attributions.\n');
});

afterEach(() => {
  vi.clearAllMocks();
});

async function getExport(id: string, query: string) {
  const { GET } = await import('../../../src/app/api/sessions/[id]/export/route');
  const req = new Request(`http://localhost/api/sessions/${id}/export?${query}`);
  return GET(req, { params: Promise.resolve({ id }) });
}

describe('GET /api/sessions/[id]/export', () => {
  it('returns 404 when session not owned', async () => {
    mocks.getSessionFn.mockResolvedValue(null);
    const res = await getExport('10', 'format=md');
    expect(res.status).toBe(404);
  });

  it('returns 409 when session state is not export or done', async () => {
    mocks.getSessionFn.mockResolvedValue({ ...SESSION_ROW, state: 'drafting' });
    const res = await getExport('10', 'format=md');
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('wrong_state');
  });

  it('allows export when state is "done"', async () => {
    mocks.getSessionFn.mockResolvedValue({ ...SESSION_ROW, state: 'done' });
    const res = await getExport('10', 'format=md');
    expect(res.status).toBe(200);
  });

  it('returns 400 when format is missing', async () => {
    const res = await getExport('10', '');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('bad_format');
  });

  it('returns 400 when format is unknown', async () => {
    const res = await getExport('10', 'format=xml');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('bad_format');
  });

  it('returns 404 when profile is missing', async () => {
    mocks.getProfileFn.mockResolvedValue(null);
    const res = await getExport('10', 'format=md');
    expect(res.status).toBe(404);
  });

  it('format=md returns a zip with the right headers and packs article.md + README.txt', async () => {
    const res = await getExport('10', 'format=md');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="article-10-md.zip"',
    );
    const bundleArg = mocks.buildZipBundleFn.mock.calls[0]![0] as Array<{
      path: string;
      bytes: unknown;
    }>;
    const paths = bundleArg.map((e) => e.path);
    expect(paths).toContain('article.md');
    expect(paths).toContain('README.txt');
    expect(mocks.renderHtmlArticleFn).not.toHaveBeenCalled();
  });

  it('format=html returns a zip wrapping the rendered HTML', async () => {
    const res = await getExport('10', 'format=html');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="article-10-html.zip"',
    );
    expect(mocks.renderHtmlArticleFn).toHaveBeenCalledWith('# Title\n\nBody.', {
      flavor: 'standard',
      headingShift: 0,
    });
    const bundleArg = mocks.buildZipBundleFn.mock.calls[0]![0] as Array<{
      path: string;
      bytes: unknown;
    }>;
    expect(bundleArg.map((e) => e.path)).toContain('article.html');
  });

  it('format=docx returns the docx bytes with the right headers', async () => {
    const res = await getExport('10', 'format=docx');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="article-10.docx"',
    );
    expect(mocks.renderDocxArticleFn).toHaveBeenCalledWith({
      contentMd: '# Title\n\nBody.',
      attachments: [],
      rules: { flavor: 'standard', headingShift: 0 },
    });
  });

  it('format=pdf renders HTML then PDF and returns the PDF bytes', async () => {
    const res = await getExport('10', 'format=pdf');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="article-10.pdf"',
    );
    expect(mocks.renderHtmlArticleFn).toHaveBeenCalled();
    expect(mocks.renderPdfArticleFn).toHaveBeenCalledWith({
      html: '<html><body>Body.</body></html>',
      attachments: [],
    });
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

import { describe, expect, it } from 'vitest';
import { renderHtmlArticle } from '../../../src/server/export/html';

const SAMPLE_MD = [
  '# Title',
  '',
  '## Subtitle',
  '',
  'Some intro paragraph.',
  '',
  '- one',
  '- two',
  '',
  '```ts',
  'const x = 1;',
  '```',
  '',
  '![Hero alt](images/hero.png) <sub>Photo by Jane</sub>',
].join('\n');

describe('renderHtmlArticle', () => {
  it('renders standard flavor with no heading shift', async () => {
    const html = await renderHtmlArticle(SAMPLE_MD, {
      flavor: 'standard',
      headingShift: 0,
    });

    expect(html).toMatch(/^<!doctype html><html><head>/);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>Article</title>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body></html>');

    expect(html).toContain('<style>');
    expect(html).toContain('max-width: 42rem');
    expect(html).toContain('font-family');
    expect(html).toContain('blockquote');

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Subtitle</h2>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
    expect(html).toContain('<code class="language-ts">const x = 1;\n</code>');
    expect(html).toContain('<img src="images/hero.png" alt="Hero alt">');
    expect(html).toContain('<sub>Photo by Jane</sub>');
  });

  it('shifts H1→H2 in habr flavor and inserts a leading newline before headings', async () => {
    const html = await renderHtmlArticle(SAMPLE_MD, {
      flavor: 'habr',
      headingShift: 0,
    });

    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<h3>Subtitle</h3>');
    expect(html).not.toMatch(/<h1\b/);

    expect(html).toMatch(/\n<h2>Title<\/h2>/);
    expect(html).toMatch(/\n<h3>Subtitle<\/h3>/);

    expect(html).toContain('<sub>Photo by Jane</sub>');
  });

  it('honors an explicit non-zero headingShift on habr flavor (no auto +1)', async () => {
    const html = await renderHtmlArticle('# Title', {
      flavor: 'habr',
      headingShift: 2,
    });
    expect(html).toContain('<h3>Title</h3>');
  });

  it('clamps the shifted depth into the 1..6 range', async () => {
    const high = await renderHtmlArticle('###### Deep', {
      flavor: 'standard',
      headingShift: 3,
    });
    expect(high).toContain('<h6>Deep</h6>');

    const low = await renderHtmlArticle('# Top', {
      flavor: 'standard',
      headingShift: -2,
    });
    expect(low).toContain('<h1>Top</h1>');
  });
});

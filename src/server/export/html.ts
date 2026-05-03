import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import type { MarkupRules } from '../profiles/markup';

type MdHeading = { type: 'heading'; depth: 1 | 2 | 3 | 4 | 5 | 6 };
type MdRoot = { children: { type: string }[] };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function effectiveHeadingShift(rules: MarkupRules): number {
  if (rules.flavor === 'habr' && rules.headingShift === 0) return 1;
  return rules.headingShift;
}

function shiftHeadings(shift: number) {
  return function plugin() {
    return function transformer(tree: unknown) {
      if (shift === 0) return;
      const root = tree as MdRoot;
      for (const node of root.children) {
        if (node.type === 'heading') {
          const heading = node as unknown as MdHeading;
          heading.depth = clamp(heading.depth + shift, 1, 6) as MdHeading['depth'];
        }
      }
    };
  };
}

function applyHabrTweaks(body: string): string {
  return body.replace(/(<h[1-6]\b)/g, '\n$1');
}

export async function renderHtmlArticle(
  markdown: string,
  rules: MarkupRules,
): Promise<string> {
  const shift = effectiveHeadingShift(rules);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(shiftHeadings(shift))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(markdown);

  let body = String(file);
  if (rules.flavor === 'habr') body = applyHabrTweaks(body);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Article</title></head><body>${body}</body></html>`;
}

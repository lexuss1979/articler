import * as fs from 'node:fs/promises';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { MarkupRules } from '../profiles/markup';
import type { ImageAttachment, AttachmentMime } from './markdown';

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

type MdNode = { type: string; [key: string]: unknown };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function imageRunType(mime: AttachmentMime): 'png' | 'jpg' | undefined {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return undefined;
}

type InlineRun = TextRun | ExternalHyperlink;

function inlineText(node: MdNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') {
    return String(node.value ?? '');
  }
  const children = (node.children as MdNode[] | undefined) ?? [];
  return children.map(inlineText).join('');
}

function inlineRuns(children: MdNode[]): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const node of children) {
    switch (node.type) {
      case 'text':
        runs.push(new TextRun({ text: String(node.value ?? '') }));
        break;
      case 'strong':
        runs.push(
          new TextRun({
            text: inlineText(node),
            bold: true,
          }),
        );
        break;
      case 'emphasis':
        runs.push(
          new TextRun({
            text: inlineText(node),
            italics: true,
          }),
        );
        break;
      case 'inlineCode':
        runs.push(
          new TextRun({
            text: String(node.value ?? ''),
            font: 'Courier New',
          }),
        );
        break;
      case 'link':
        runs.push(
          new ExternalHyperlink({
            link: String(node.url ?? ''),
            children: [new TextRun({ text: inlineText(node), style: 'Hyperlink' })],
          }),
        );
        break;
      case 'break':
        runs.push(new TextRun({ text: '', break: 1 }));
        break;
      default:
        break;
    }
  }
  return runs;
}

async function imageParagraph(
  imageNode: MdNode,
  attachments: ImageAttachment[],
): Promise<Paragraph | null> {
  const url = String(imageNode.url ?? '');
  const att = attachments.find((a) => a.bundlePath === url);
  if (!att) return null;
  const type = imageRunType(att.mime);
  if (!type) return null;
  const bytes = await fs.readFile(att.absSourcePath);
  return new Paragraph({
    children: [
      new ImageRun({
        data: bytes,
        transformation: { width: 480, height: 270 },
        type,
      }),
    ],
  });
}

async function blockToParagraphs(
  node: MdNode,
  attachments: ImageAttachment[],
  shift: number,
  unsupported: Set<string>,
): Promise<Paragraph[]> {
  switch (node.type) {
    case 'heading': {
      const depth = clamp(((node.depth as number) ?? 1) + shift, 1, 6);
      return [
        new Paragraph({
          heading: HEADING_LEVELS[depth - 1],
          children: inlineRuns((node.children as MdNode[]) ?? []),
        }),
      ];
    }
    case 'paragraph': {
      const children = (node.children as MdNode[]) ?? [];
      if (children.length === 1 && children[0]!.type === 'image') {
        const para = await imageParagraph(children[0]!, attachments);
        if (para) return [para];
      }
      return [new Paragraph({ children: inlineRuns(children) })];
    }
    case 'list': {
      const ordered = Boolean(node.ordered);
      const items = (node.children as MdNode[]) ?? [];
      const paragraphs: Paragraph[] = [];
      items.forEach((li, idx) => {
        const liChildren = ((li as MdNode).children as MdNode[] | undefined) ?? [];
        for (const child of liChildren) {
          if (child.type !== 'paragraph') continue;
          const runs = inlineRuns((child.children as MdNode[]) ?? []);
          if (ordered) {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun({ text: `${idx + 1}. ` }), ...runs],
              }),
            );
          } else {
            paragraphs.push(new Paragraph({ children: runs, bullet: { level: 0 } }));
          }
        }
      });
      return paragraphs;
    }
    case 'code': {
      const value = String(node.value ?? '');
      const lines = value.length === 0 ? [''] : value.split('\n');
      return lines.map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, font: 'Courier New' })],
          }),
      );
    }
    case 'blockquote': {
      const inner: Paragraph[] = [];
      for (const child of (node.children as MdNode[]) ?? []) {
        if (child.type === 'paragraph') {
          inner.push(
            new Paragraph({
              style: 'IntenseQuote',
              children: inlineRuns((child.children as MdNode[]) ?? []),
            }),
          );
        }
      }
      return inner.length > 0 ? inner : [new Paragraph({ style: 'IntenseQuote', children: [] })];
    }
    default: {
      unsupported.add(node.type);
      return [
        new Paragraph({
          children: [new TextRun({ text: `[unsupported: ${node.type}]`, italics: true })],
        }),
      ];
    }
  }
}

export async function renderDocxArticle({
  contentMd,
  attachments,
  rules,
}: {
  contentMd: string;
  attachments: ImageAttachment[];
  rules: MarkupRules;
}): Promise<Buffer> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(contentMd) as unknown as {
    children: MdNode[];
  };

  const unsupported = new Set<string>();
  const blocks: Paragraph[] = [];
  for (const node of tree.children) {
    const paragraphs = await blockToParagraphs(node, attachments, rules.headingShift, unsupported);
    blocks.push(...paragraphs);
  }

  const doc = new Document({
    sections: [{ properties: {}, children: blocks }],
  });

  return Packer.toBuffer(doc);
}

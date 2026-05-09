const PREFIXES = ['scope_', 'tone_', 'format_', 'structure_', 'audience_', 'custom_'];
const SUFFIXES = ['_scope', '_tone', '_format', '_structure', '_audience', '_custom'];

function stripCategoryMarkers(key: string): string {
  const s = key.toLowerCase();
  for (const p of PREFIXES) {
    if (s.startsWith(p)) return s.slice(p.length);
  }
  for (const sfx of SUFFIXES) {
    if (s.endsWith(sfx)) return s.slice(0, s.length - sfx.length);
  }
  return s;
}

function bigramBag(s: string): Map<string, number> {
  const bag = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    bag.set(bg, (bag.get(bg) ?? 0) + 1);
  }
  return bag;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [bg, ca] of a) {
    normA += ca * ca;
    const cb = b.get(bg) ?? 0;
    dot += ca * cb;
  }
  for (const [, cb] of b) normB += cb * cb;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function keySimilarity(a: string, b: string): number {
  const sa = stripCategoryMarkers(a);
  const sb = stripCategoryMarkers(b);
  if (sa === sb) return 1.0;
  if (sa.length < 2 || sb.length < 2) return 0;
  return cosine(bigramBag(sa), bigramBag(sb));
}

export function findSimilarKey(
  target: string,
  candidates: string[],
  threshold = 0.85,
): { key: string; similarity: number } | null {
  let best: { key: string; similarity: number } | null = null;
  for (const c of candidates) {
    const sim = keySimilarity(target, c);
    if (sim >= threshold && (best === null || sim > best.similarity)) {
      best = { key: c, similarity: sim };
    }
  }
  return best;
}

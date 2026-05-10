export const SKIP_CONFIDENCE = 0.85;
export const SKIP_EVIDENCE = 3;
export const AUTO_DELETE_BELOW = 0.20;
export const AGREEMENT_DELTA = 0.10;
export const CONTRADICTION_DELTA = 0.25;
export const DECAY_PER_30D = 0.02;
export const INITIAL_CONFIDENCE = 0.5;
export const CLARIFY_INJECT_MIN_CONFIDENCE = 0.6;

export function applyAgreement(c: number): number {
  return Math.min(1.0, c + AGREEMENT_DELTA);
}

export function applyContradiction(c: number): number {
  return Math.max(0.0, c - CONTRADICTION_DELTA);
}

export function applyDecay(c: number, updatedAt: Date, now: Date): number {
  const msElapsed = now.getTime() - updatedAt.getTime();
  const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
  const periods = Math.floor(daysElapsed / 30);
  return Math.max(0, c - DECAY_PER_30D * periods);
}

export function shouldSkipQuestion({
  confidence,
  evidenceCount,
}: {
  confidence: number;
  evidenceCount: number;
}): boolean {
  return confidence >= SKIP_CONFIDENCE && evidenceCount >= SKIP_EVIDENCE;
}

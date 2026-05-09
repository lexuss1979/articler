// TODO: refresh these prices from OpenRouter — last checked 2026-05-01
export const MODEL_PRICES: Record<string, { promptPerMTok: number; completionPerMTok: number }> = {
  'anthropic/claude-opus-4.7': { promptPerMTok: 15, completionPerMTok: 75 },
  'anthropic/claude-haiku-4.5': { promptPerMTok: 1, completionPerMTok: 5 },
  'perplexity/sonar-pro': { promptPerMTok: 3, completionPerMTok: 15 },
  'openai/gpt-5': { promptPerMTok: 10, completionPerMTok: 30 },
  'openai/gpt-5-mini': { promptPerMTok: 0.6, completionPerMTok: 2.4 },
  'google/gemini-3.1-flash-image-preview': { promptPerMTok: 0, completionPerMTok: 0 },
  'openai/gpt-5.4-image-2': { promptPerMTok: 0, completionPerMTok: 0 },
};

// TODO: refresh these prices from OpenRouter — last checked 2026-05-01
export const IMAGE_PRICES: Record<string, { perImage: number }> = {
  'google/gemini-3.1-flash-image-preview': { perImage: 0.04 },
  'openai/gpt-5.4-image-2': { perImage: 0.04 },
};

export function costFor(model: string, prompt: number, completion: number): number {
  const prices = MODEL_PRICES[model];
  if (!prices) {
    console.warn(`[pricing] unknown model "${model}" — cost defaulting to 0`);
    return 0;
  }
  const cost = (prices.promptPerMTok * prompt + prices.completionPerMTok * completion) / 1_000_000;
  return parseFloat(cost.toFixed(6));
}

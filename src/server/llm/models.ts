export const MODEL_ROUTING = {
  smart: {
    primary: process.env.LLM_SMART_PRIMARY ?? 'anthropic/claude-opus-4.7',
    fallback: process.env.LLM_SMART_FALLBACK ?? 'openai/gpt-5',
  },
  fast: {
    primary: process.env.LLM_FAST_PRIMARY ?? 'anthropic/claude-haiku-4.5',
    fallback: process.env.LLM_FAST_FALLBACK ?? 'openai/gpt-5-mini',
  },
  search: {
    primary: process.env.LLM_SEARCH_PRIMARY ?? 'perplexity/sonar-pro',
  },
  image: {
    primary: process.env.LLM_IMAGE_PRIMARY ?? 'google/gemini-3.1-flash-image-preview',
    secondary: process.env.LLM_IMAGE_SECONDARY ?? 'openai/gpt-5.4-image-2',
  },
};

export type ModelClass = keyof typeof MODEL_ROUTING;

export function modelsFor(cls: ModelClass): string[] {
  const entry = MODEL_ROUTING[cls];
  const models: string[] = [entry.primary];
  if ('fallback' in entry) models.push(entry.fallback);
  if ('secondary' in entry) models.push(entry.secondary);
  return models;
}

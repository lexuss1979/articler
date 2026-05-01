export const MODEL_ROUTING = {
  smart: { primary: 'anthropic/claude-opus-4.7', fallback: 'openai/gpt-5' },
  fast: { primary: 'anthropic/claude-haiku-4.5', fallback: 'openai/gpt-5-mini' },
  search: { primary: 'perplexity/sonar-pro' },
  image: { primary: 'google/nano-banana', secondary: 'openai/image-2' },
} as const;

export type ModelClass = keyof typeof MODEL_ROUTING;

export function modelsFor(cls: ModelClass): string[] {
  const entry = MODEL_ROUTING[cls];
  const models: string[] = [entry.primary];
  if ('fallback' in entry) models.push(entry.fallback);
  if ('secondary' in entry) models.push(entry.secondary);
  return models;
}

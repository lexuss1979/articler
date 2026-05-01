import { describe, it, expect } from 'vitest';
import { MODEL_ROUTING, modelsFor, type ModelClass } from '../../../src/server/llm/models';

describe('modelsFor', () => {
  const classes: ModelClass[] = ['smart', 'fast', 'search', 'image'];

  it.each(classes)('returns a non-empty list for %s', (cls) => {
    expect(modelsFor(cls).length).toBeGreaterThan(0);
  });

  it('returns primary first for smart', () => {
    expect(modelsFor('smart')[0]).toBe(MODEL_ROUTING.smart.primary);
  });

  it('returns both models for image', () => {
    const models = modelsFor('image');
    expect(models).toContain(MODEL_ROUTING.image.primary);
    expect(models).toContain(MODEL_ROUTING.image.secondary);
    expect(models.length).toBe(2);
  });
});

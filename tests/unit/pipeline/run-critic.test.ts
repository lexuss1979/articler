import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRouteJsonChat = vi.fn();

vi.mock('../../../src/server/llm/structured', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/llm/structured')>();
  return { ...actual, routeJsonChat: mockRouteJsonChat };
});

function makeCtx() {
  const emitted: Array<[string, unknown]> = [];
  return {
    emit: vi.fn(async (kind: string, payload: unknown) => {
      emitted.push([kind, payload]);
      return { id: 1, sessionId: 1, kind, payload, ts: new Date() };
    }),
    userInput: vi.fn(),
    log: { append: vi.fn() },
    llm: {} as never,
    _emitted: emitted,
  };
}

const profile = {
  id: 1,
  userId: 1,
  name: 'Habr longread',
  format: 'long_read',
  style: 'Technical',
  audience: 'Software engineers',
  targetVolumeMin: 2000,
  targetVolumeMax: 4000,
  markupRules: {},
  extraPrompt: '',
  createdAt: new Date(),
};

const plan = {
  thesis: 'Prompt caching reduces costs significantly.',
  targetTakeaway: 'Use prompt caching to save money.',
  sections: [
    {
      id: 'intro',
      title: 'Introduction',
      intent: 'Hook the reader.',
      keyPoints: ['Overview'],
      expectedLength: 200,
    },
    {
      id: 'body',
      title: 'Main Content',
      intent: 'Explain the topic.',
      keyPoints: ['Details'],
      expectedLength: 1000,
    },
  ],
};

const critic = {
  id: 'editorial',
  label: 'Editorial',
  systemPrompt: 'You are a senior editor. Look for factual issues.',
  defaultEnabled: true,
};

const sectionDrafts = [
  { sectionId: 'intro', contentMd: '# Introduction\nHello world.' },
  { sectionId: 'body', contentMd: '# Main\nDetails here.' },
];

const validFinding = {
  criticId: 'editorial',
  severity: 'minor' as const,
  span: { sectionId: 'intro', charStart: 0, charEnd: 10 },
  problem: 'Weak opening.',
  suggestedChange: 'Start stronger.',
  rationale: 'First impression matters.',
};

const invalidFinding = {
  criticId: 'editorial',
  severity: 'info' as const,
  span: { sectionId: 'nonexistent_section', charStart: 0, charEnd: 5 },
  problem: 'Some issue.',
  suggestedChange: 'Fix it.',
  rationale: 'Because.',
};

function makeJsonChatResult(findings: unknown[]) {
  return {
    result: { findings },
    modelUsed: 'claude-sonnet',
    modelClass: 'smart' as const,
    promptTokens: 100,
    completionTokens: 200,
    latencyMs: 500,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('runCritic stage', () => {
  it('filters out findings whose sectionId is not in the plan', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([validFinding, invalidFinding]));
    const { runCritic } = await import('../../../src/server/pipeline/stages/run-critic');
    const ctx = makeCtx();
    const result = await runCritic.run({ critic, plan, profile, sectionDrafts }, ctx);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject(validFinding);
  });

  it('emits task_started then task_completed with expected payloads', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([validFinding]));
    const { runCritic } = await import('../../../src/server/pipeline/stages/run-critic');
    const ctx = makeCtx();
    await runCritic.run({ critic, plan, profile, sectionDrafts }, ctx);

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'run_critic', criticId: 'editorial' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'run_critic', criticId: 'editorial', count: 1 });
  });

  it('count in task_completed reflects post-filter finding count', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([validFinding, invalidFinding]));
    const { runCritic } = await import('../../../src/server/pipeline/stages/run-critic');
    const ctx = makeCtx();
    await runCritic.run({ critic, plan, profile, sectionDrafts }, ctx);

    expect(ctx._emitted[1][1]).toMatchObject({ count: 1 });
  });

  it('system prompt contains critic systemPrompt and plan thesis', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { runCritic } = await import('../../../src/server/pipeline/stages/run-critic');
    const ctx = makeCtx();
    await runCritic.run({ critic, plan, profile, sectionDrafts }, ctx);

    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { system: string; user: string };
    expect(callArgs.system).toContain(critic.systemPrompt);
    expect(callArgs.system).toContain(plan.thesis);
  });

  it('calls routeJsonChat with class smart', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { runCritic } = await import('../../../src/server/pipeline/stages/run-critic');
    const ctx = makeCtx();
    await runCritic.run({ critic, plan, profile, sectionDrafts }, ctx);

    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'smart' });
  });
});

describe('runCritic stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot when routeJsonChat returns it', async () => {
    type Fixture = { input: unknown; expected: { snapshot: { findings: unknown[] } } };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/run_critic/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockRouteJsonChat.mockResolvedValue({
      result: fixture.expected.snapshot,
      modelUsed: 'claude-sonnet',
      modelClass: 'smart' as const,
      promptTokens: 100,
      completionTokens: 100,
      latencyMs: 400,
    });

    const { runCritic } = await import('../../../src/server/pipeline/stages/run-critic');
    const ctx = makeCtx();
    const result = await runCritic.run(
      fixture.input as Parameters<typeof runCritic.run>[0],
      ctx,
    );
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

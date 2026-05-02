import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mockRouteChat = vi.fn();

vi.mock('../../../src/server/llm/router', () => ({
  routeChat: mockRouteChat,
}));

function makeChatResult(content: string) {
  return {
    content,
    modelUsed: 'anthropic/claude-opus-4.7',
    modelClass: 'smart',
    promptTokens: 10,
    completionTokens: 20,
    latencyMs: 100,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('routeJsonChat', () => {
  const schema = z.object({ answer: z.string(), score: z.number() });

  it('returns parsed and validated result on a valid JSON response', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult('{"answer":"yes","score":42}'));

    const { routeJsonChat } = await import('../../../src/server/llm/structured');
    const result = await routeJsonChat({ system: 'sys', user: 'q', schema });

    expect(result.result).toEqual({ answer: 'yes', score: 42 });
    expect(result.modelUsed).toBe('anthropic/claude-opus-4.7');
    expect(result.promptTokens).toBe(10);
  });

  it('throws JsonChatParseError when content is not valid JSON', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult('not json at all'));

    const { routeJsonChat, JsonChatParseError } = await import('../../../src/server/llm/structured');
    await expect(routeJsonChat({ system: 'sys', user: 'q', schema })).rejects.toBeInstanceOf(
      JsonChatParseError,
    );
  });

  it('throws JsonChatSchemaError when JSON does not match schema on both attempts', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult('{"answer":123}'));

    const { routeJsonChat, JsonChatSchemaError } = await import('../../../src/server/llm/structured');
    await expect(routeJsonChat({ system: 'sys', user: 'q', schema })).rejects.toBeInstanceOf(
      JsonChatSchemaError,
    );
    expect(mockRouteChat).toHaveBeenCalledTimes(2);
  });

  it('retries with schema issues in prompt and succeeds on second attempt', async () => {
    mockRouteChat
      .mockResolvedValueOnce(makeChatResult('{"answer":123}'))
      .mockResolvedValueOnce(makeChatResult('{"answer":"fixed","score":5}'));

    const { routeJsonChat } = await import('../../../src/server/llm/structured');
    const result = await routeJsonChat({ system: 'sys', user: 'q', schema });

    expect(result.result).toEqual({ answer: 'fixed', score: 5 });
    expect(mockRouteChat).toHaveBeenCalledTimes(2);
    const retryCall = mockRouteChat.mock.calls[1][0] as { messages: Array<{ content: string }> };
    expect(retryCall.messages[1].content).toContain('schema validation errors');
  });

  it('passes response_format json_schema to routeChat', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult('{"answer":"ok","score":1}'));

    const { routeJsonChat } = await import('../../../src/server/llm/structured');
    await routeJsonChat({ system: 's', user: 'u', schema });

    const callArg = mockRouteChat.mock.calls[0][0] as Record<string, unknown>;
    const rf = callArg.response_format as { type: string; json_schema?: { schema: unknown } };
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema?.schema).toBeDefined();
  });
});

import { getProfile } from '../profiles/repo';
import { fetchExampleUrl } from '../profiles/fetch-example-url';
import { analyzeExamples } from './stages/analyze-examples';
import { replaceAssertionsBySource } from '../profiles/profile-assertions-repo';
import { runWithLLMContext } from '../llm/context';

export type RunAnalyzeExamplesInput = {
  userId: number;
  profileId: number;
  inputs: Array<{ kind: 'url' | 'text'; value: string }>;
};

export type RunAnalyzeExamplesResult =
  | {
      ok: true;
      summary: string;
      count: number;
      urlErrors: Array<{ index: number; error: string }>;
    }
  | {
      ok: false;
      error: 'profile_not_found' | 'too_few_examples' | 'analyze_failed';
    };

const MIN_EXAMPLES = 3;

export async function runAnalyzeExamples({
  userId,
  profileId,
  inputs,
}: RunAnalyzeExamplesInput): Promise<RunAnalyzeExamplesResult> {
  const profile = await getProfile(userId, profileId);
  if (!profile) return { ok: false, error: 'profile_not_found' };

  const contents: string[] = [];
  const urlErrors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    if (input.kind === 'text') {
      contents.push(input.value);
    } else {
      const result = await fetchExampleUrl(input.value);
      if (result.ok) {
        contents.push(result.content);
      } else {
        urlErrors.push({ index: i, error: result.error });
      }
    }
  }

  if (contents.length < MIN_EXAMPLES) {
    return { ok: false, error: 'too_few_examples' };
  }

  const examples = contents.map((content) => ({ content }));

  try {
    const ctx = {
      emit: async () => ({ id: 0, sessionId: 0, kind: '' as never, payload: {}, ts: new Date() }),
      userInput: () => Promise.reject(new Error('userInput not available')),
      log: { append: async () => {} },
      llm: {} as never,
    };

    const output = await runWithLLMContext(
      { userId, stage: 'analyze_examples', task: 'analyze_examples' },
      () => analyzeExamples.run({ profile, examples }, ctx),
    );

    await replaceAssertionsBySource(profileId, 'examples', output.items);

    return {
      ok: true,
      summary: output.summary,
      count: output.items.length,
      urlErrors,
    };
  } catch {
    return { ok: false, error: 'analyze_failed' };
  }
}

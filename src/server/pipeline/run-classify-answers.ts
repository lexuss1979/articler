import { getProfile } from '../profiles/repo';
import {
  listAssertions,
  recordAgreement,
  recordContradiction,
  upsertAssertion,
} from '../profiles/profile-assertions-repo';
import { classifyAnswers } from './stages/classify-answers';
import { validateAssertionGenerality } from './stages/validate-assertion-generality';
import { withStageCtx } from './with-stage-ctx';
import { findSimilarKey } from '../profiles/key-similarity';

export type RunClassifyAnswersInput = {
  userId: number;
  sessionId: number;
  profileId: number;
  qa: Array<{ question: string; answer: string }>;
};

export async function runClassifyAnswers({
  userId,
  sessionId,
  profileId,
  qa,
}: RunClassifyAnswersInput): Promise<{
  applied: number;
  skipped: number;
  droppedAsTopicBound: number;
}> {
  const profile = await getProfile(userId, profileId);
  if (!profile) throw new Error('profile_not_found');

  const existingAssertions = await listAssertions(profileId);

  const ctx = {
    emit: async () => ({ id: 0, sessionId: 0, kind: '' as never, payload: {}, ts: new Date() }),
    userInput: () => Promise.reject(new Error('userInput not available')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const { delta } = await withStageCtx(classifyAnswers, sessionId, userId, () =>
    classifyAnswers.run({ profile, qa, existingAssertions }, ctx),
  );

  const newItems = delta.filter(
    (d): d is Extract<typeof d, { kind: 'new' }> => d.kind === 'new',
  );

  let topicBoundKeys = new Set<string>();
  if (newItems.length > 0) {
    const { results } = await withStageCtx(
      validateAssertionGenerality,
      sessionId,
      userId,
      () =>
        validateAssertionGenerality.run(
          {
            items: newItems.map(({ key, category, assertion }) => ({
              key,
              category,
              assertion,
            })),
          },
          ctx,
        ),
    );
    topicBoundKeys = new Set(results.filter((r) => r.passes !== true).map((r) => r.key));
  }

  let applied = 0;
  let skipped = 0;
  let droppedAsTopicBound = 0;

  for (const item of delta) {
    if (item.kind === 'agree') {
      const result = await recordAgreement(profileId, item.key);
      if (result === null) skipped++;
      else applied++;
    } else if (item.kind === 'contradict') {
      const result = await recordContradiction(profileId, item.key);
      if (result === null) skipped++;
      else applied++;
    } else {
      if (topicBoundKeys.has(item.key)) {
        droppedAsTopicBound++;
        continue;
      }
      const match = findSimilarKey(item.key, existingAssertions.map((a) => a.key));
      if (match) {
        await recordAgreement(profileId, match.key);
        applied++;
      } else {
        await upsertAssertion({
          profileId,
          key: item.key,
          category: item.category,
          assertion: item.assertion,
          source: 'session',
        });
        applied++;
      }
    }
  }

  return { applied, skipped, droppedAsTopicBound };
}

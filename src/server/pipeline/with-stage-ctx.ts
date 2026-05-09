import { runWithLLMContext } from '../llm/context';
import type { Stage } from './stage';

export function withStageCtx<T>(
  stage: Pick<Stage<unknown, unknown>, 'name'>,
  sessionId: number,
  userId: number,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithLLMContext(
    { userId, sessionId, stage: stage.name, task: stage.name },
    fn,
  );
}

import { emitEvent } from '../events/bus';
import { startRunner } from '../pipeline/runner';
import { updateSessionState } from '../sessions/repo';
import { BATCH_CONCURRENCY, assertBatchCaps } from './caps';
import { countActiveLightSessions, findQueuedLightSessions } from './repo';

const inFlightDispatches = new Map<number, Promise<void>>();

export function dispatchBatchQueue(userId: number): Promise<void> {
  const existing = inFlightDispatches.get(userId);
  if (existing) {
    return existing.then(() => {});
  }

  const promise = (async () => {
    const active = await countActiveLightSessions(userId);
    const slotsAvailable = Math.max(0, BATCH_CONCURRENCY - active);
    if (slotsAvailable === 0) return;

    const queued = await findQueuedLightSessions(userId, slotsAvailable);

    for (const session of queued) {
      const capsResult = await assertBatchCaps(userId, 0);
      if (!capsResult.ok) {
        const reason = `cap_exceeded:${capsResult.error}`;
        await updateSessionState(userId, session.id, 'failed');
        await emitEvent(session.id, 'state_changed', { state: 'failed', reason });
        continue;
      }

      await updateSessionState(userId, session.id, 'planning');
      await emitEvent(session.id, 'state_changed', { state: 'planning' });
      void startRunner(session.id, userId).catch((err) => {
        console.error('[batch/runner] failed for session', session.id, err instanceof Error ? err.message : err);
      });
    }
  })();

  inFlightDispatches.set(userId, promise);
  return promise.finally(() => {
    inFlightDispatches.delete(userId);
  });
}

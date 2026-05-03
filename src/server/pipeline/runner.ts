import { z, type ZodSchema } from 'zod';
import { emitEvent } from '../events/bus';
import { appendRunLog } from '../logging/jsonl';
import { routeChat, routeSearch, routeImage } from '../llm/router';
import { getProfile } from '../profiles/repo';
import { briefSchema } from '../sessions/brief';
import { planSchema } from '../sessions/plan';
import { getSession, updateSessionDraft, updateSessionPlan, updateSessionState } from '../sessions/repo';
import { insertSource, listSessionSources } from '../sessions/sources-repo';
import { upsertSectionDraft, listSectionDrafts } from '../sessions/section-drafts-repo';
import { clarifyBrief } from './stages/clarify-brief';
import { proposeAngles } from './stages/propose-angles';
import { buildPlan } from './stages/build-plan';
import { planSearchHypotheses } from './stages/plan-search-hypotheses';
import { formulateQueries } from './stages/formulate-queries';
import { webSearch } from './stages/web-search';
import { summarizeSource } from './stages/summarize-source';
import { draftSection } from './stages/draft-section';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  schema: ZodSchema<unknown>;
};

declare global {
  // eslint-disable-next-line no-var
  var __pendingInputs: Map<number, Pending> | undefined;
  // eslint-disable-next-line no-var
  var __activeRunners: Set<number> | undefined;
}
const pendingInputs = (global.__pendingInputs ??= new Map<number, Pending>());
const activeRunners = (global.__activeRunners ??= new Set<number>());

function makeCtx(sessionId: number, state: string) {
  return {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput<T>(prompt: string, schema: ZodSchema<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pendingInputs.set(sessionId, {
          resolve: resolve as (v: unknown) => void,
          reject,
          schema: schema as ZodSchema<unknown>,
        });
        emitEvent(sessionId, 'awaiting_user', { prompt });
      });
    },
    log: {
      async append(entry: object) {
        await appendRunLog({ sessionId, stage: state, ...entry });
      },
    },
    llm: {
      routeChat: (args: Parameters<typeof routeChat>[0]) => routeChat(args),
      routeSearch: (args: Parameters<typeof routeSearch>[0]) => routeSearch(args),
      routeImage: (args: Parameters<typeof routeImage>[0]) => routeImage(args),
    },
  };
}

export async function startRunner(
  sessionId: number,
  userId: number,
  internal = false,
): Promise<void> {
  if (!internal) {
    if (activeRunners.has(sessionId)) return;
    if (pendingInputs.has(sessionId)) return;
    activeRunners.add(sessionId);
  }
  try {
    await runStage(sessionId, userId);
  } catch (err) {
    console.error('[runner] crashed:', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    if (!internal) activeRunners.delete(sessionId);
  }
}

async function runStage(sessionId: number, userId: number): Promise<void> {
  const session = await getSession(userId, sessionId);
  if (!session) return;

  const ctx = makeCtx(sessionId, session.state);

  switch (session.state) {
    case 'planning': {
      const briefParsed = briefSchema.safeParse(session.brief);
      if (!briefParsed.success) {
        await ctx.emit('agent_message', { text: 'Session brief is missing or invalid.' });
        return;
      }
      const brief = briefParsed.data;

      const profile = await getProfile(userId, session.profileId);
      if (!profile) {
        await ctx.emit('agent_message', { text: 'Session profile not found.' });
        return;
      }

      // Step 1: clarify brief
      const { questions } = await clarifyBrief.run({ brief, profile }, ctx);

      let clarifications: Array<{ question: string; answer: string }> = [];
      if (questions.length > 0) {
        await ctx.emit('artifact_updated', { kind: 'questions', questions });
        const { answers } = await ctx.userInput(
          'clarify',
          z.object({ answers: z.array(z.string().min(1)).length(questions.length) }),
        );
        clarifications = questions.map((q, i) => ({ question: q.question, answer: answers[i]! }));
      }

      // Step 2: propose angles
      const { angles } = await proposeAngles.run({ brief, profile, clarifications }, ctx);
      await ctx.emit('artifact_updated', { kind: 'angles', angles });

      const { index } = await ctx.userInput(
        'angle_choice',
        z.object({ index: z.number().int().min(0).max(angles.length - 1) }),
      );
      const chosenAngle = angles[index]!;

      // Step 3: build plan
      const plan = await buildPlan.run({ brief, profile, angle: chosenAngle, clarifications }, ctx);
      await updateSessionPlan(userId, sessionId, plan);
      await ctx.emit('artifact_updated', { kind: 'plan', plan });

      // Step 4: await plan lock
      await ctx.userInput('plan_lock', z.object({ action: z.literal('lock') }));

      await updateSessionState(userId, sessionId, 'research');
      await ctx.emit('state_changed', { state: 'research' });
      await startRunner(sessionId, userId, true);
      break;
    }
    case 'research': {
      const planParsed = planSchema.safeParse(session.plan);
      if (!planParsed.success) {
        await ctx.emit('agent_message', { text: 'Session plan is missing or invalid.', error: true });
        return;
      }
      const plan = planParsed.data;

      const profile = await getProfile(userId, session.profileId);
      if (!profile) {
        await ctx.emit('agent_message', { text: 'Session profile not found.', error: true });
        return;
      }

      try {
        const { hypotheses } = await planSearchHypotheses.run({ plan, profile }, ctx);
        await ctx.emit('artifact_updated', { kind: 'hypotheses', hypotheses });

        await Promise.all(
          hypotheses.map(async (hypothesis) => {
            const { queries } = await formulateQueries.run({ hypothesis }, ctx);
            for (const query of queries) {
              const { hits } = await webSearch.run({ sessionId, userId, hypothesis, query }, ctx);
              for (const hit of hits) {
                try {
                  const { summary, relevanceScore } = await summarizeSource.run(
                    { hypothesis, query, hit },
                    ctx,
                  );
                  const status =
                    relevanceScore >= 70 ? 'accepted' : relevanceScore < 40 ? 'rejected' : 'proposed';
                  const source = await insertSource(userId, sessionId, {
                    sectionId: hypothesis.sectionId,
                    hypothesis: hypothesis.text,
                    query: query.text,
                    url: hit.url,
                    title: hit.title,
                    rawExcerpt: hit.snippet,
                    summary,
                    relevanceScore,
                    status,
                  });
                  if (source) {
                    await ctx.emit('artifact_updated', { kind: 'source', source });
                  }
                } catch (err) {
                  console.warn('[research] skipping hit due to error:', hit.url, err instanceof Error ? err.message : err);
                }
              }
            }
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[research] failed:', err);
        await ctx.emit('agent_message', { text: `Research failed: ${msg}`, error: true });
        return;
      }

      await ctx.userInput('research_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'drafting');
      await ctx.emit('state_changed', { state: 'drafting' });
      await startRunner(sessionId, userId, true);
      break;
    }
    case 'drafting': {
      const planParsed = planSchema.safeParse(session.plan);
      if (!planParsed.success) {
        await ctx.emit('agent_message', { text: 'Session plan is missing or invalid.', error: true });
        return;
      }
      const plan = planParsed.data;

      const briefParsed = briefSchema.safeParse(session.brief);
      if (!briefParsed.success) {
        await ctx.emit('agent_message', { text: 'Session brief is missing or invalid.', error: true });
        return;
      }
      const brief = briefParsed.data;

      const profile = await getProfile(userId, session.profileId);
      if (!profile) {
        await ctx.emit('agent_message', { text: 'Session profile not found.', error: true });
        return;
      }

      const allSources = await listSessionSources(userId, sessionId);
      const acceptedSources = allSources.filter((s) => s.status === 'accepted');

      const existingDrafts = await listSectionDrafts(userId, sessionId);
      const existingMap = new Map(existingDrafts.map((d) => [d.sectionId, d.contentMd]));

      const drafted: Array<{ id: string; contentMd: string }> = [];
      for (const section of plan.sections) {
        const cached = existingMap.get(section.id);
        if (cached && cached.trim().length > 0) {
          drafted.push({ id: section.id, contentMd: cached });
          await ctx.emit('artifact_updated', {
            kind: 'section_draft',
            sectionId: section.id,
            contentMd: cached,
          });
          continue;
        }

        const sectionSources = acceptedSources.filter((s) => s.sectionId === section.id);
        const prevSections = [...drafted];

        const { contentMd } = await draftSection.run(
          {
            profile,
            plan,
            section,
            acceptedSources: sectionSources.map((s) => ({
              url: s.url,
              title: s.title,
              summary: s.summary,
              rawExcerpt: s.rawExcerpt,
            })),
            prevSections,
            rewriteSourceArticles: session.mode === 'rewrite' ? brief.sourceArticles : undefined,
          },
          ctx,
        );

        await upsertSectionDraft(userId, sessionId, section.id, contentMd);
        drafted.push({ id: section.id, contentMd });

        const draftMd = drafted.map((d) => d.contentMd).join('\n\n');
        await updateSessionDraft(userId, sessionId, draftMd);
        await ctx.emit('artifact_updated', { kind: 'section_draft', sectionId: section.id, contentMd });
      }

      // Make sure draftMd reflects all sections (in case some were resumed from cache)
      const fullDraft = drafted.map((d) => d.contentMd).join('\n\n');
      if (fullDraft !== session.draftMd) {
        await updateSessionDraft(userId, sessionId, fullDraft);
      }

      await ctx.userInput('draft_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'review');
      await ctx.emit('state_changed', { state: 'review' });
      await startRunner(sessionId, userId, true);
      break;
    }
    case 'review': {
      await ctx.userInput('review_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'decoration');
      await ctx.emit('state_changed', { state: 'decoration' });
      await startRunner(sessionId, userId, true);
      break;
    }
    case 'decoration': {
      await ctx.userInput('decoration_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'illustration');
      await ctx.emit('state_changed', { state: 'illustration' });
      await startRunner(sessionId, userId, true);
      break;
    }
    case 'illustration': {
      await ctx.userInput('illustration_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'export');
      await ctx.emit('state_changed', { state: 'export' });
      await startRunner(sessionId, userId, true);
      break;
    }
    case 'export': {
      await ctx.userInput('export_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'done');
      await ctx.emit('state_changed', { state: 'done' });
      break;
    }
    default:
      break;
  }
}

export function resolveUserInput(sessionId: number, value: unknown): boolean {
  const pending = pendingInputs.get(sessionId);
  if (!pending) return false;

  const parsed = pending.schema.safeParse(value);
  if (!parsed.success) return false;

  pendingInputs.delete(sessionId);
  pending.resolve(parsed.data);
  return true;
}

export function hasPendingInput(sessionId: number): boolean {
  return pendingInputs.has(sessionId);
}

export function cancelPendingInput(sessionId: number): void {
  const pending = pendingInputs.get(sessionId);
  if (pending) {
    pendingInputs.delete(sessionId);
    pending.reject(new Error('Session reset'));
  }
}

import { z, type ZodSchema } from 'zod';
import { emitEvent } from '../events/bus';
import { dispatchBatchQueue } from '../batches/dispatcher';
import { BudgetExceededError } from '../llm/budget-guard';
import { appendRunLog } from '../logging/jsonl';
import { routeChat, routeSearch, routeImage } from '../llm/router';
import { withStageCtx } from './with-stage-ctx';
import { getProfile } from '../profiles/repo';
import { briefSchema } from '../sessions/brief';
import { planSchema } from '../sessions/plan';
import { getSession, updateSessionDraft, updateSessionDraftPreReview, updateSessionPlan, updateSessionState } from '../sessions/repo';
import { insertSource, listSessionSources } from '../sessions/sources-repo';
import { upsertSectionDraft, listSectionDrafts } from '../sessions/section-drafts-repo';
import { listAssertions } from '../profiles/profile-assertions-repo';
import { runClassifyAnswers } from './run-classify-answers';
import { clarifyBrief } from './stages/clarify-brief';
import { proposeAngles } from './stages/propose-angles';
import { buildPlan } from './stages/build-plan';
import { planSearchHypotheses } from './stages/plan-search-hypotheses';
import { formulateQueries } from './stages/formulate-queries';
import { webSearch } from './stages/web-search';
import { summarizeSource } from './stages/summarize-source';
import { draftSection } from './stages/draft-section';
import { draftFull } from './stages/draft-full';
import { runAutoReview } from './run-auto-review';
import { runLightClaimsExtraction } from './run-light-claims-extraction';
import { runLightHeroImage } from './run-light-hero-image';

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
    if (err instanceof BudgetExceededError) {
      await updateSessionState(userId, sessionId, 'failed');
      await emitEvent(sessionId, 'state_changed', { state: 'failed', reason: 'budget_exceeded' });
      return;
    }
    console.error('[runner] crashed:', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    if (!internal) {
      activeRunners.delete(sessionId);
      void dispatchBatchQueue(userId).catch((err) => {
        console.error('[batch/dispatch] failed:', err);
      });
    }
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
      const knownAssertions = await listAssertions(session.profileId);
      const { questions } = await withStageCtx(clarifyBrief, sessionId, userId, () =>
        clarifyBrief.run({ brief, profile, knownAssertions }, ctx),
      );

      let clarifications: Array<{ question: string; answer: string }> = [];
      if (questions.length > 0) {
        await ctx.emit('artifact_updated', { kind: 'questions', questions });
        const { answers } = await ctx.userInput(
          'clarify',
          z.object({ answers: z.array(z.string().min(1)).length(questions.length) }),
        );
        clarifications = questions.map((q, i) => ({ question: q.question, answer: answers[i]! }));
      }

      if (clarifications.length > 0) {
        try {
          await runClassifyAnswers({
            userId,
            sessionId,
            profileId: session.profileId,
            qa: clarifications,
            brief: { topic: brief.topic, goal: brief.goal, notes: brief.notes },
          });
        } catch (err) {
          console.warn('[planning] classify-answers enrichment failed:', err instanceof Error ? err.message : err);
        }
      }

      if (session.mode === 'light') {
        // Light mode: auto-pick the model's recommended angle, no user gates
        const lightResult = await withStageCtx(proposeAngles, sessionId, userId, () =>
          proposeAngles.run({ brief, profile, clarifications }, ctx),
        );
        const { angles, recommendedIndex, recommendationReason } = lightResult;
        await ctx.emit('artifact_updated', { kind: 'angles', angles, recommendedIndex, recommendationReason });
        const chosenAngle = angles[recommendedIndex]!;

        const plan = await withStageCtx(buildPlan, sessionId, userId, () =>
          buildPlan.run({ brief, profile, angle: chosenAngle, clarifications }, ctx),
        );
        await updateSessionPlan(userId, sessionId, plan);
        await ctx.emit('artifact_updated', { kind: 'plan', plan });

        await updateSessionState(userId, sessionId, 'research');
        await ctx.emit('state_changed', { state: 'research' });
        await startRunner(sessionId, userId, true);
      } else {
        // Step 2: propose angles (full mode — user picks)
        const { angles } = await withStageCtx(proposeAngles, sessionId, userId, () =>
          proposeAngles.run({ brief, profile, clarifications }, ctx),
        );
        await ctx.emit('artifact_updated', { kind: 'angles', angles });

        const { index } = await ctx.userInput(
          'angle_choice',
          z.object({ index: z.number().int().min(0).max(angles.length - 1) }),
        );
        const chosenAngle = angles[index]!;

        // Step 3: build plan
        const plan = await withStageCtx(buildPlan, sessionId, userId, () =>
          buildPlan.run({ brief, profile, angle: chosenAngle, clarifications }, ctx),
        );
        await updateSessionPlan(userId, sessionId, plan);
        await ctx.emit('artifact_updated', { kind: 'plan', plan });

        // Step 4: await plan lock
        await ctx.userInput('plan_lock', z.object({ action: z.literal('lock') }));

        await updateSessionState(userId, sessionId, 'research');
        await ctx.emit('state_changed', { state: 'research' });
        await startRunner(sessionId, userId, true);
      }
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

      if (session.mode === 'light') {
        if (profile.lightResearchSources === 0) {
          await ctx.emit('artifact_updated', { kind: 'research_skipped' });
        } else {
          const briefParsed = briefSchema.safeParse(session.brief);
          if (!briefParsed.success) {
            await ctx.emit('agent_message', { text: 'Session brief is missing or invalid.', error: true });
            return;
          }
          const brief = briefParsed.data;
          const lightHypothesis = { id: 'light', sectionId: 'all', text: brief.topic, evidenceKind: 'general' };
          const lightQuery = { text: brief.topic };

          try {
            const { hits } = await withStageCtx(webSearch, sessionId, userId, () =>
              webSearch.run({ sessionId, userId, hypothesis: lightHypothesis, query: lightQuery }, ctx),
            );
            const retainedHits = hits.slice(0, profile.lightResearchSources);
            for (const hit of retainedHits) {
              try {
                const { summary, relevanceScore } = await withStageCtx(summarizeSource, sessionId, userId, () =>
                  summarizeSource.run({ hypothesis: lightHypothesis, query: lightQuery, hit }, ctx),
                );
                const source = await insertSource(userId, sessionId, {
                  sectionId: null,
                  hypothesis: brief.topic,
                  query: brief.topic,
                  url: hit.url,
                  title: hit.title,
                  rawExcerpt: hit.snippet,
                  summary,
                  relevanceScore,
                  status: 'accepted',
                });
                if (source) {
                  await ctx.emit('artifact_updated', { kind: 'source', source });
                }
              } catch (err) {
                console.warn('[research/light] skipping hit:', hit.url, err instanceof Error ? err.message : err);
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[research/light] failed:', err);
            await ctx.emit('agent_message', { text: `Research failed: ${msg}`, error: true });
            return;
          }
        }

        await updateSessionState(userId, sessionId, 'drafting');
        await ctx.emit('state_changed', { state: 'drafting' });
        await startRunner(sessionId, userId, true);
      } else {
        try {
          const { hypotheses } = await withStageCtx(planSearchHypotheses, sessionId, userId, () =>
            planSearchHypotheses.run({ plan, profile }, ctx),
          );
          await ctx.emit('artifact_updated', { kind: 'hypotheses', hypotheses });

          await Promise.all(
            hypotheses.map(async (hypothesis) => {
              const { queries } = await withStageCtx(formulateQueries, sessionId, userId, () =>
                formulateQueries.run({ hypothesis }, ctx),
              );
              for (const query of queries) {
                const { hits } = await withStageCtx(webSearch, sessionId, userId, () =>
                  webSearch.run({ sessionId, userId, hypothesis, query }, ctx),
                );
                for (const hit of hits) {
                  try {
                    const { summary, relevanceScore } = await withStageCtx(
                      summarizeSource,
                      sessionId,
                      userId,
                      () => summarizeSource.run({ hypothesis, query, hit }, ctx),
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
      }
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

      if (session.mode === 'light') {
        const allSources = await listSessionSources(userId, sessionId);
        const acceptedSources = allSources.filter((s) => s.status === 'accepted');
        const { contentMd, wordCount } = await withStageCtx(draftFull, sessionId, userId, () =>
          draftFull.run(
            {
              profile,
              brief,
              plan,
              sources: acceptedSources.map((s) => ({
                url: s.url,
                title: s.title,
                summary: s.summary,
                rawExcerpt: s.rawExcerpt,
              })),
              lightMaxWords: profile.lightMaxWords,
            },
            ctx,
          ),
        );
        await updateSessionDraft(userId, sessionId, contentMd);
        await ctx.emit('artifact_updated', { kind: 'full_draft', contentMd, wordCount });
        await updateSessionState(userId, sessionId, 'review');
        await ctx.emit('state_changed', { state: 'review' });
        await startRunner(sessionId, userId, true);
      } else {
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

          const { contentMd } = await withStageCtx(draftSection, sessionId, userId, () =>
            draftSection.run(
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
            ),
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
      }
      break;
    }
    case 'review': {
      if (session.mode === 'light') {
        if (session.draftMdPreReview == null) {
          await updateSessionDraftPreReview(userId, sessionId, session.draftMd!);
        }

        const autoReviewResult = await runAutoReview({ sessionId, userId });
        if (!autoReviewResult.ok) {
          await ctx.emit('agent_message', {
            text: `Auto-review failed: ${autoReviewResult.error}`,
            error: true,
          });
          return;
        }

        await updateSessionDraft(userId, sessionId, autoReviewResult.revisedMd);
        await ctx.emit('artifact_updated', {
          kind: 'auto_review_applied',
          changeCount: autoReviewResult.changeCount,
          changes: autoReviewResult.changes,
        });

        const claimsResult = await runLightClaimsExtraction({
          sessionId,
          userId,
          revisedMd: autoReviewResult.revisedMd,
        });
        if (claimsResult.ok === false) {
          await ctx.emit('agent_message', {
            text: `Claim extraction failed: ${claimsResult.error}`,
            error: true,
          });
        }

        await updateSessionState(userId, sessionId, 'done');
        await ctx.emit('state_changed', { state: 'done' });
        void runLightHeroImage({ sessionId, userId }).catch((err) => {
          console.error('[runner/light/hero] failed:', err instanceof Error ? err.message : err);
        });
        return;
      }

      await ctx.userInput('review_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'decoration');
      await ctx.emit('state_changed', { state: 'decoration' });
      await startRunner(sessionId, userId, true);
      break;
    }
    case 'decoration': {
      if (session.mode === 'light') return;

      await ctx.userInput('decoration_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'illustration');
      await ctx.emit('state_changed', { state: 'illustration' });
      await startRunner(sessionId, userId, true);
      break;
    }
    case 'illustration': {
      if (session.mode === 'light') return;

      await ctx.userInput('illustration_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'export');
      await ctx.emit('state_changed', { state: 'export' });
      await startRunner(sessionId, userId, true);
      break;
    }
    case 'export': {
      if (session.mode === 'light') return;

      await ctx.userInput('export_done', z.object({ action: z.literal('finish') }));

      await updateSessionState(userId, sessionId, 'done');
      await ctx.emit('state_changed', { state: 'done' });
      break;
    }
    case 'queued':
      return;
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

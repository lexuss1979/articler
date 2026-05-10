# Articler — Light Mode Implementation Plan

## How this document works

- The implementation is broken into **epics**, ordered by dependency.
- One epic at a time is **planned in detail** (a checked-list of small,
  individually-implementable tasks). The rest are stubs (`status: TBD`)
  with intent only.
- The marker `<!-- PLANING_CHECKPOINT -->` separates _planned_ epics
  (above) from _unplanned_ epics (below). Exactly one such marker exists
  in the document at all times.
- The **planner agent** (see `prompts/plan_epic.md`) reads this file,
  finds the checkpoint, expands the _next_ epic below it into tasks,
  and moves the checkpoint past that epic.
- The **implementer agent** (see `prompts/implement_task.md`) takes the
  next unchecked task from the most recently planned epic and does it.

> **Note for planner agent**: when running against this file, substitute
> `LIGHTMODE_IMPLEMENTATION_PLAN.md` wherever `plan_epic.md` and
> `implement_task.md` refer to `IMPLEMENTATION_PLAN.md`. Also read the
> existing `IMPLEMENTATION_PLAN.md` and current `src/` tree for full
> context — this plan extends the existing codebase.

### Task format

Each task block looks like:

```
- [ ] T-L<epic>-<n>: <one-line title>
      Goal: <what we want>
      Touches: <file/path globs>
      Acceptance:
        - <observable check 1>
        - <observable check 2>
      Notes (optional): <gotchas, references>
```

Acceptance criteria must be checkable mechanically (a command, a UI
action, a passing test) — not "looks good".

### Definition of done (every task)

- `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass locally.
- New code has at least one test (unit or integration) where the change
  has logic worth testing.
- Changes are committed as a single focused commit.

---

## Background & design decisions

### What is Light Mode?

Light mode is a second session mode (`mode = 'light'`) designed for
high-volume production of short, simple articles with minimal
human-in-the-loop interaction. A user provides a topic and answers a
small number of targeted clarification questions; the pipeline then runs
fully automatically and delivers a finished article.

Full mode (existing) is optimised for quality and editorial control.
Light mode is optimised for throughput and automation.

### Repository state at planning time

This plan was reconciled against the codebase at commit `c459668`
(post-Epic 22). Hard constraints inherited from the existing system:

- **Sessions `mode` value space.** Currently `'new' | 'rewrite'` in
  `sessions/repo.ts` and related zod schemas. Light mode adds a third
  value: the resulting space is `'new' | 'rewrite' | 'light'`. Existing
  values are not renamed.
- **Claims subsystem already exists relationally.** Tables: `claims`
  (FK `round_id NOT NULL → critique_rounds.id`, columns `span`,
  `span_hash`, `claim_text`, `claim_type` ∈ {statistic | named_entity |
  event | attribution | definition | other}, `check_worthiness` ∈
  {low | medium | high}, `status`), `claim_verdicts` (`verdict` ∈
  {verified | contradicted | unverifiable | needs_caveat},
  `justification`), `claim_evidence` (`url`, `snippet`, `supports`).
  Stages `extract-claims` (`modelClass: 'smart'`, input
  `{plan, sectionDrafts}`), `verify-claim` (`'search'`),
  `adjudicate-claim` (`'smart'`) are implemented and wrapped by
  `run-fact-check.ts`. **Light mode reuses all of this** instead of
  introducing a parallel jsonb store. To keep `claims.round_id` valid
  without a migration, light mode creates a synthetic `critique_round`
  of `kind = 'auto_review'` per session at review time.
- **Budget enforcement is live (Epic 13/18/19/20).**
  `user_settings.monthly_cap_usd` and `session_cap_usd` are enforced
  via `assertBudget` in the LLM router; `BudgetExceededError`
  short-circuits stage calls. Batch creation (L-9) must respect this
  *in addition to* count-based caps — not replace it.
- **Stage invariant: `withStageCtx`.** Every stage call must be wrapped
  in `withStageCtx(stage, sessionId, userId, () => stage.run(input,
  ctx))` (from `pipeline/with-stage-ctx.ts`) so the AsyncLocalStorage
  `LLMContext` is available to the router. Skipping this silently
  bypasses logging + budget enforcement — a pre-existing bug fixed in
  Epic 19/20. Every new orchestrator added by this plan (light runner
  branch, `run-auto-review`, on-demand verify, batch dispatcher) MUST
  follow this.
- **Snapshot column distinct from existing revision columns.**
  `sessions.revisedDraftMd` and `sessions.revisionStatus` already exist
  but hold the full-mode *pending revision* (proposed by
  `apply-revisions`, awaiting accept/reject). Light mode wants the
  inverse semantic: preserve the *original* for revert. Therefore the
  plan adds a separate column `sessions.draft_md_pre_review text NULL`
  rather than overload existing semantics.
- **State machine.** Existing flow:
  `briefing → planning → research → drafting → review → decoration →
  illustration → export → done`. Light mode short-circuits this:
  inside the `review` case the runner runs auto-review + claims
  extraction, then advances **directly to `done`**, skipping
  `decoration`, `illustration`, and `export` states. Hero image
  generation is a fire-and-forget post-`done` task that streams via
  SSE; export buttons on the `done` page reuse the same export
  endpoints full mode uses from its `export` state.

### Pipeline comparison

| Step | Full mode | Light mode |
|------|-----------|------------|
| Brief | Rich form | Single topic field |
| Clarification | Generic 3-5 questions | Assertion-aware questions (fewer over time) |
| Answer classifier | — | Hidden LLM pass → updates profile assertions |
| Angle selection | User picks | Auto: `angles[recommendedIndex]` (score returned by `propose-angles`) |
| Plan lock | User reviews + locks | Auto-locked |
| Research | Deep: N hypotheses × M queries | Shallow: 1 query, 0–2 sources (profile setting) |
| Drafting | Section by section | Single-shot full article (`draft-full`), capped by `profiles.lightMaxWords` (default 800) |
| Review | Interactive critics, user-triggered ("Run review" button) | Auto-review (humanity + coherence) over a snapshot of the pre-review draft, runner-triggered |
| Claims & fact-check | User-triggered batch via "Run fact-check" button (existing `extract-claims` + `verify-claim` + `adjudicate-claim`) | Auto-extracted claims at end of `review`, **per-claim opt-in** verify (reuses the same three stages) |
| Image | Candidate selection UI; multiple slots | 1 hero image, auto-attached, dispatched async after `done` |
| Export | User-triggered from `export` state | User-triggered from `done` state (light mode skips `decoration` / `illustration` / `export` states) |

### Profile assertions

Each platform profile accumulates a `profile_assertions` table that
stores learned user preferences inferred from past light-mode sessions.
Assertions are written by a hidden `classify-answers` stage that runs
after the user answers clarification questions. They are visible to the
user in the profile settings page (read + delete).

As assertion confidence builds, the `clarify-brief` stage skips
questions whose answer is already known, so the interaction shrinks
towards zero over time.

Assertions also feed an optional "Add examples" flow: the user provides
3-4 sample articles; a `analyze-examples` stage extracts style
characteristics and seeds the assertions table without any prior
sessions.

### Assertion data model

```ts
profile_assertions
  id           serial PK
  profile_id   integer  NOT NULL → profiles.id  ON DELETE CASCADE
  category     text     NOT NULL  -- 'scope' | 'tone' | 'format' | 'structure' | 'audience' | 'custom'
  key          text     NOT NULL  -- short machine-readable slug, unique per profile+category
  assertion    text     NOT NULL  -- human-readable statement, e.g. "user avoids documentation references"
  confidence   numeric(4,3) NOT NULL DEFAULT 0.5  -- 0.0–1.0
  evidence_count integer NOT NULL DEFAULT 1
  source       text     NOT NULL DEFAULT 'session'  -- 'session' | 'examples'
  created_at   timestamp default now NOT NULL
  updated_at   timestamp default now NOT NULL
  UNIQUE (profile_id, key)
```

`key` is a stable slug assigned by the classifier (e.g.
`scope_single_focus`, `tone_clickbait`, `format_no_docs`). The
classifier is instructed to reuse existing keys when updating known
preferences and introduce new keys only for genuinely new traits.

### Assertion confidence policy

**Skip threshold.** `clarify-brief` suppresses a question only when a
matching assertion has both `confidence ≥ 0.85` and `evidence_count ≥ 3`.
Below this threshold the model still asks, but the prompt may bias the
wording toward confirming or contradicting the assertion.

**Reinforcement vs. contradiction.** When `classify-answers` produces a
delta:
- *Agreement* with existing assertion → `confidence = min(1.0, c + 0.10)`,
  `evidence_count += 1`.
- *Contradiction* (explicit negative evidence) → `confidence = max(0.0, c − 0.25)`,
  `evidence_count += 1`.
- New assertion → insert with `confidence = 0.5`, `evidence_count = 1`.

Assertions that fall below `confidence < 0.20` are auto-deleted.

**Decay.** Lazy decay on read: when an assertion is fetched, if more
than 30 days have passed since `updated_at`, subtract `0.02 × floor(days/30)`
from `confidence` (clamp at 0). This avoids a separate cron and prevents
stale assertions from dominating forever.

**Key vocabulary stability.** The classifier prompt is given the full
list of existing keys plus a fixed seed vocabulary
(`scope_*`, `tone_*`, `format_*`, `structure_*`, `audience_*`, `custom_*`).
After the LLM emits its delta, a deterministic post-pass checks each
*new* key against existing keys via embedding similarity (`cosine ≥ 0.85`)
and merges duplicates into the existing key. This guards against
`tone_clickbait` vs. `clickbait_tone` drift.

### Quality guardrails for light mode

Constraints that span multiple epics, listed here so each implementer
doesn't re-derive them:

- **Article length cap.** `profiles.lightMaxWords integer NOT NULL DEFAULT 800`
  (allowed range 200–2500). `draft-full` receives this as a hard target;
  a postprocessing pass truncates the draft to `lightMaxWords × 1.15`
  words if the model overshoots. Topics needing more than 2500 words
  should be redirected to full mode.
- **Angle ranking.** `propose-angles` is extended to return
  `{ angles, recommendedIndex: number, recommendationReason: string }`.
  Light mode auto-picks `angles[recommendedIndex]`, never `angles[0]`
  blindly. Full mode shows all angles unchanged; the recommended one is
  highlighted but not auto-selected.
- **Pre-review draft snapshot.** Before `auto-review` writes its
  revision, the runner copies current `draft_md` into a **new** column
  `sessions.draft_md_pre_review text NULL`. This is **distinct from**
  the pre-existing `revisedDraftMd` / `revisionStatus` columns (those
  hold *pending* revisions in the full-mode flow — opposite semantic).
  The result UI exposes a "revert to pre-review" action.
- **Batch caps stack on top of USD budget.** Existing per-user
  `monthly_cap_usd` / `session_cap_usd` enforcement (Epic 13) stays in
  force. L-9 adds **count-based** daily caps on top:
  `BATCH_CONCURRENCY = 6` (max simultaneous light sessions per user),
  `BATCH_DAILY_SESSION_CAP = 100`, `BATCH_DAILY_IMAGE_CAP = 100`
  (env-overridable). Batch creation rejects when *either* USD or count
  cap would be breached. Mid-batch, individual sessions still
  short-circuit with `BudgetExceededError` if USD cap is hit, which the
  batch dispatcher must surface in the batch list page UI rather than
  silently failing.

### User intervention points in light mode

Despite the "fully automatic" framing, the light pipeline has exactly
**two** intervention points:

1. **Briefing → planning.** User submits topic, then answers any
   remaining clarification questions.
2. **`done` state (post-review).** User sees finished article +
   auto-review change summary + extracted claims list. From here they
   can: (a) accept & export, (b) opt into per-claim fact-check,
   (c) revert to pre-review snapshot, (d) edit manually, (e) regenerate
   from `drafting`.

All other state transitions are runner-driven and require zero clicks.

### URL ingestion caveat (Epic L-2)

The "Add examples" form accepts raw URLs but URL fetching is
**best-effort**: paywalls, JS-rendered pages, bot detection, and
robots.txt routinely defeat naive `fetch`. The form must surface
per-URL fetch failures inline and let the user paste the article body
manually as fallback. Do not block the analyze step on URL failures —
proceed with whichever inputs succeeded as long as ≥ 3 examples remain.

---

## Epic L-1 — Profile assertions: DB foundation + repo + settings UI

**Status: planned**

**Goal:** Add the `profile_assertions` table, a typed repo module
implementing the confidence policy, and a read/delete view inside the
existing profile settings page. No LLM involved yet — this is the pure
data layer that all subsequent epics build on.

**Intent:** After this epic a developer can run `pnpm db:migrate`, open
a profile in the UI, and see an "Assertions" panel (initially empty).
The repo module `profile-assertions-repo.ts` exposes:

- `listAssertions(profileId)` — returns rows with lazy decay applied.
- `upsertAssertion({ profileId, key, category, assertion, source })` —
  creates or updates with `evidence_count = 1, confidence = 0.5` for
  new rows.
- `recordAgreement(profileId, key)` and `recordContradiction(profileId, key)` —
  apply the +0.10 / −0.25 deltas from the policy.
- `deleteAssertion(id)` and `replaceAssertions(profileId, items)` — for
  the examples flow and manual deletion.
- `mergeDuplicateKey(profileId, fromKey, toKey)` — used by the embedding
  dedup post-pass in L-3.

The settings panel lists assertions grouped by `category`, shows
confidence as a small bar, and offers a delete button per row.

### Tasks

- [x] T-L1-1: `profile_assertions` schema + Drizzle migration
      Goal: New `profile_assertions` table per the data model in the
      "Assertion data model" section. All columns NOT NULL with the
      stated defaults; `UNIQUE (profile_id, key)`; FK
      `profile_id → profiles.id ON DELETE CASCADE`. `category` is a
      free-text column (validated at the repo / zod layer, not via SQL
      enum, to allow `'custom'` and future categories without
      migration).
      Touches: `src/server/db/schema.ts`,
      `drizzle/0013_<generated>.sql` (new),
      `drizzle/meta/_journal.json`, `drizzle/meta/0013_snapshot.json`.
      Acceptance:
        - `pnpm db:generate` produces a migration whose `CREATE TABLE`
          contains all eight columns with the stated types
          (`numeric(4,3)` for `confidence`, `integer` for
          `evidence_count`, `text` for `category`/`key`/`assertion`/
          `source`, `timestamp` for `created_at`/`updated_at`),
          the unique index on `(profile_id, key)`, and the FK with
          `ON DELETE CASCADE`.
        - `pnpm db:migrate` against the compose DB creates the table;
          re-run is a no-op.
        - Deleting a profile cascades — verified with a unit/integration
          test: insert a profile + an assertion, delete the profile,
          assert the assertion row is gone.
        - `pnpm typecheck` passes with the new schema export.

- [x] T-L1-2: Confidence policy as a pure module
      Goal: A standalone module with no DB dependency that encodes the
      thresholds and deltas from "Assertion confidence policy". Exports
      named constants and four pure functions:
        - `SKIP_CONFIDENCE = 0.85`, `SKIP_EVIDENCE = 3`,
          `AUTO_DELETE_BELOW = 0.20`, `AGREEMENT_DELTA = 0.10`,
          `CONTRADICTION_DELTA = 0.25`, `DECAY_PER_30D = 0.02`,
          `INITIAL_CONFIDENCE = 0.5`.
        - `applyAgreement(c: number): number` — `min(1.0, c + 0.10)`.
        - `applyContradiction(c: number): number` — `max(0.0, c − 0.25)`.
        - `applyDecay(c: number, updatedAt: Date, now: Date): number` —
          `max(0, c − 0.02 × floor(daysElapsed / 30))`.
        - `shouldSkipQuestion({ confidence, evidenceCount }): boolean` —
          `confidence ≥ SKIP_CONFIDENCE && evidenceCount ≥ SKIP_EVIDENCE`.
      Touches: `src/server/profiles/assertion-policy.ts` (new),
      `tests/unit/server/profiles/assertion-policy.test.ts` (new).
      Acceptance:
        - Unit tests cover boundary conditions: agreement clamps at 1.0,
          contradiction clamps at 0.0, decay returns input unchanged
          when `now − updatedAt < 30d`, decay subtracts 0.04 at exactly
          61 days, decay clamps at 0 for very old rows.
        - `shouldSkipQuestion` test: 0.85/3 → true, 0.85/2 → false,
          0.84/3 → false, 1.0/10 → true.
        - `pnpm test` passes.

- [x] T-L1-3: Repo: `upsertAssertion` + `listAssertions` with decay & auto-delete
      Goal: New repo module `profile-assertions-repo.ts` with two
      methods:
        - `upsertAssertion({ profileId, key, category, assertion, source }):
           Promise<Assertion>`. Inserts on conflict (per
          `UNIQUE (profile_id, key)`) updates `assertion`, `category`,
          `source`, `updated_at = now()` but **does not** change
          `confidence` or `evidence_count` — those move only via
          `recordAgreement` / `recordContradiction`. New rows: insert
          with `confidence = INITIAL_CONFIDENCE`, `evidence_count = 1`,
          `source` from input (default `'session'`).
        - `listAssertions(profileId): Promise<Assertion[]>`. Reads all
          rows for the profile; for each row applies `applyDecay`. If
          decayed `confidence < AUTO_DELETE_BELOW`, the row is deleted
          (single bulk `DELETE` after the read, by id list) and omitted
          from the returned array. The returned rows reflect the
          decayed confidence (write-back to DB is best-effort: persist
          decayed value alongside the delete pass so future reads are
          O(1) — single `UPDATE ... SET confidence = CASE id ...`).
      Type: `Assertion = { id, profileId, category, key, assertion,
       confidence, evidenceCount, source, createdAt, updatedAt }`.
      Touches: `src/server/profiles/profile-assertions-repo.ts` (new),
      `tests/integration/profiles/assertions-repo.test.ts` (new).
      Acceptance:
        - Integration test (gated on `DATABASE_URL` like other repo
          tests): inserting via `upsertAssertion` then re-calling with
          the same `(profileId, key)` and a different `assertion` text
          updates the text but leaves `confidence` and `evidence_count`
          untouched.
        - Integration test: insert a row with `confidence = 0.5` and
          backdate `updated_at` to 90 days ago via raw SQL; calling
          `listAssertions` returns it with `confidence ≈ 0.44` (0.5 −
          3×0.02) and persists the decayed value.
        - Integration test: insert a row with `confidence = 0.21` and
          backdate `updated_at` 60 days; `listAssertions` returns
          0 rows for that profile *and* the row is removed from the
          DB.
        - `pnpm typecheck && pnpm test` exit 0.

- [x] T-L1-4: Repo: `recordAgreement` and `recordContradiction`
      Goal: Add two methods to `profile-assertions-repo.ts` that look
      up the row by `(profileId, key)`, apply `applyAgreement` /
      `applyContradiction` from T-L1-2, increment `evidence_count`, set
      `updated_at = now()`. If the key is missing, both are no-ops
      returning `null`. After a `recordContradiction` brings
      `confidence < AUTO_DELETE_BELOW`, the row is deleted in the same
      call (one transaction).
      Touches: `src/server/profiles/profile-assertions-repo.ts`
      (extend), `tests/integration/profiles/assertions-repo.test.ts`
      (extend).
      Acceptance:
        - Integration test: upsert with confidence 0.5, evidence 1;
          three `recordAgreement` calls leave it at confidence 0.8,
          evidence 4.
        - Integration test: upsert at the default 0.5/1; one
          `recordContradiction` leaves it at 0.25/2 (still present);
          a second drops it to 0.0 → row is deleted.
        - Integration test: `recordAgreement(profileId, 'unknown_key')`
          returns `null` and inserts nothing.
        - `pnpm test` passes.

- [x] T-L1-5: Repo: `deleteAssertion` and `replaceAssertions`
      Goal: Add two methods to `profile-assertions-repo.ts`:
        - `deleteAssertion(profileId, assertionId): Promise<boolean>` —
          deletes the row only if it belongs to `profileId` (returns
          `true` on hit, `false` on miss). The `profileId` parameter is
          required so callers can authorize through the parent profile;
          callers must already have verified profile ownership.
        - `replaceAssertions(profileId, items: Array<{ key, category,
           assertion, source }>): Promise<void>` — runs in a single
          transaction: deletes all existing rows for the profile, then
          inserts each item with `confidence = INITIAL_CONFIDENCE`,
          `evidence_count = 1`. Used by L-2's "analyze examples" reset.
      Touches: `src/server/profiles/profile-assertions-repo.ts`
      (extend), `tests/integration/profiles/assertions-repo.test.ts`
      (extend).
      Acceptance:
        - Integration test: `deleteAssertion(p1, id)` returns `true`
          and removes the row; `deleteAssertion(p2, id)` (wrong
          profile) returns `false` and leaves the row in place.
        - Integration test: seed three assertions on a profile, call
          `replaceAssertions` with two new items, then `listAssertions`
          returns exactly the two new rows at the default 0.5/1.
        - Integration test: `replaceAssertions` of an empty array
          clears the profile.

- [x] T-L1-6: Repo: `mergeDuplicateKey`
      Goal: Add `mergeDuplicateKey(profileId, fromKey, toKey):
       Promise<Assertion | null>` to `profile-assertions-repo.ts`.
      Semantics: in one transaction, look up rows for `fromKey` and
      `toKey` (scoped to `profileId`). If `fromKey` is missing →
      no-op, return current `toKey` row (or `null` if both missing).
      If `toKey` is missing → rename `fromKey` row to `toKey`. If
      both present → set `toKey.confidence = max(from.confidence,
       to.confidence)`, `toKey.evidence_count = from.evidence_count +
       to.evidence_count`, `toKey.updated_at = now()`, then delete the
      `fromKey` row. Returns the resulting `toKey` row (or `null`).
      Touches: `src/server/profiles/profile-assertions-repo.ts`
      (extend), `tests/integration/profiles/assertions-repo.test.ts`
      (extend).
      Acceptance:
        - Integration test: both keys present (from: 0.6/2, to: 0.7/4);
          after `mergeDuplicateKey`, `to` row is 0.7/6, `from` row is
          gone.
        - Integration test: only `from` present; after merge, only
          `to` exists with the renamed assertion + same stats.
        - Integration test: only `to` present; merge is a no-op and
          returns the existing `to` row unchanged.
        - Integration test: neither present; returns `null`.
      Notes: this helper is consumed by L-3's classifier dedup pass;
      the embedding similarity check itself is *not* part of this
      task.

- [x] T-L1-7: Assertions panel on profile edit page (server action + UI)
      Goal: Render an "Assertions" section on
      `/profiles/[id]/edit` listing the profile's assertions grouped
      by `category`, each row showing `assertion`, a horizontal
      confidence bar (width = `confidence × 100%`), `evidenceCount`
      badge, and a delete button. Initially empty profiles show a
      muted "No assertions yet — they're learned from your sessions
      and examples." placeholder. Add a server action
      `deleteAssertionAction({ profileId, assertionId })` in the
      existing `src/app/(app)/profiles/actions.ts` that loads the
      profile via `getProfile(user.id, profileId)` (returns 404 if
      not owned), calls `deleteAssertion(profileId, assertionId)`,
      and `revalidatePath('/profiles/[id]/edit', 'page')`.
      Touches: `src/app/(app)/profiles/actions.ts` (extend),
      `src/app/(app)/profiles/[id]/edit/page.tsx` (load assertions,
      render panel), `src/app/(app)/profiles/[id]/edit/assertions-panel.tsx`
      (new, client component for delete buttons),
      `tests/unit/server/profiles/delete-assertion-action.test.ts`
      (new).
      Acceptance:
        - Unit test: action denies a delete when the profile is not
          owned by the current user (mocked `requireUser` + mocked
          `getProfile` returning `null`); `deleteAssertion` is not
          called.
        - Unit test: action calls `deleteAssertion(profileId,
           assertionId)` exactly once when ownership passes.
        - Manual: visit `/profiles/<id>/edit` with `pnpm dev` and
          confirm the empty-state placeholder renders. After running
          a SQL `INSERT` that adds two assertions in different
          categories, reload — both appear under their category
          headers with a confidence bar and a delete button. Clicking
          delete removes the row and the page revalidates.
        - `pnpm lint && pnpm typecheck && pnpm test` pass.
      Notes: no new public API endpoint — the delete uses a server
      action invoked from the client component via the standard
      `useActionState` pattern already used by `EditForm`. The
      assertions list itself is rendered by the server component on
      page load; the client component only owns the per-row delete
      button + optimistic update.

---

## Epic L-2 — "Add examples" style analyzer

**Status: planned**

**Goal:** A user can provide 3-4 example articles (plain text or URLs)
on the profile settings page and receive an auto-generated summary of
detected style characteristics. The detected characteristics are stored
as assertions in `profile_assertions` with `source = 'examples'` and
displayed immediately in the Assertions panel from L-1.

**Intent:** Introduce the `analyze-examples` pipeline stage
(`modelClass: 'smart'`). Input: an array of article texts (extracted
from URLs via best-effort fetch — see "URL ingestion caveat" — or pasted
directly). Output: typed `ExampleAnalysis` containing a human-readable
summary paragraph and a list of `{ key, category, assertion }` items to
seed into the assertions table. Wire a server action and a small UI
form under "Add examples" in the profile edit page. The form shows
per-input fetch status and lets the user paste raw text when fetch
fails. Assertions created here can be individually deleted from the
Assertions panel. Session-level example upload is deferred.

### Tasks

- [x] T-L2-1: `analyze-examples` stage (smart model)
      Goal: New stage `analyzeExamples: Stage<AnalyzeExamplesInput,
       AnalyzeExamplesOutput>` in
      `src/server/pipeline/stages/analyze-examples.ts` with
      `modelClass: 'smart'`. Input shape:
      `{ profile: ProfileRow, examples: Array<{ content: string }> }`
      (caller filters out failed URL fetches before invoking — the
      stage assumes all `examples[].content` is plain text). Output
      shape (zod-validated):
      `{ summary: string, items: Array<{ key: string, category: 'scope'
       | 'tone' | 'format' | 'structure' | 'audience' | 'custom',
       assertion: string }> }`.
      System prompt: instruct the model to read the example articles
      and emit (a) one short paragraph summarising detected style
      characteristics and (b) up to ~12 `{ key, category, assertion }`
      items. The prompt MUST list the seed key-vocabulary prefixes
      (`scope_*`, `tone_*`, `format_*`, `structure_*`, `audience_*`,
      `custom_*`) and instruct the model to reuse those prefixes when
      assigning new keys, per the "Key vocabulary stability" section.
      Use `routeJsonChat({ class: 'smart', ... })` exactly like
      `extract-claims.ts`. Emit `task_started` and `task_completed`
      events with `stage: 'analyze_examples'` and the item count.
      Touches: `src/server/pipeline/stages/analyze-examples.ts` (new),
      `tests/unit/pipeline/analyze-examples.test.ts` (new).
      Acceptance:
        - Unit test mocks `routeJsonChat` (mirroring the pattern in
          `tests/unit/pipeline/extract-claims.test.ts`) and asserts
          the stage forwards the model's `{ summary, items }` verbatim
          when valid.
        - Unit test asserts the stage emits exactly
          `['task_started', 'task_completed']` with
          `stage: 'analyze_examples'` and `count = items.length` on
          the completion event.
        - Unit test asserts the stage's system prompt string contains
          all five seed prefixes (`scope_`, `tone_`, `format_`,
          `structure_`, `audience_`) so the vocabulary contract is
          honoured.
        - Unit test asserts `routeJsonChat` is called with
          `class: 'smart'`.
        - `pnpm typecheck && pnpm test` exit 0.

- [x] T-L2-2: Best-effort URL fetcher for example articles
      Goal: New helper `fetchExampleUrl(url: string):
       Promise<{ ok: true; content: string } | { ok: false; error: string }>`
      in `src/server/profiles/fetch-example-url.ts`. Implementation:
      `fetch(url)` with a 10s `AbortSignal.timeout`, accept response
      only if status is 200 and `content-type` starts with `text/html`
      or `text/plain`; cap response body at 2 MB (read as text, slice
      after read for simplicity); strip `<script>` and `<style>`
      blocks, then strip remaining HTML tags, collapse whitespace, cap
      final text at 50_000 chars. On any failure (non-200, network
      error, timeout, oversize) return
      `{ ok: false, error: <short reason> }` — never throw.
      Touches: `src/server/profiles/fetch-example-url.ts` (new),
      `tests/unit/profiles/fetch-example-url.test.ts` (new).
      Acceptance:
        - Unit test stubs `globalThis.fetch` with a 200 `text/html`
          response containing `<script>bad()</script><p>hi</p>` and
          asserts the result is `{ ok: true, content: 'hi' }` (script
          stripped, tags removed).
        - Unit test stubs a 404 response and asserts
          `{ ok: false }` with a non-empty error string.
        - Unit test stubs `fetch` to throw and asserts the helper
          returns `{ ok: false, ... }` rather than rethrowing.
        - Unit test stubs a 200 response with `content-type:
           application/pdf` and asserts `{ ok: false, ... }`.
        - `pnpm test` passes.
      Notes: deliberately no readability/cheerio dep — see "URL
      ingestion caveat". The user can always paste raw text on
      failure.
      Decision needed: timeout duration. Default: 10 s.

- [x] T-L2-3: Repo: `replaceAssertionsBySource`
      Goal: Add `replaceAssertionsBySource(profileId: number, source:
       string, items: Array<{ key: string; category: string;
       assertion: string }>): Promise<void>` to
      `src/server/profiles/profile-assertions-repo.ts`. Single
      transaction: `DELETE FROM profile_assertions WHERE profile_id =
      ? AND source = ?`, then insert each item with the same `source`,
      `confidence = INITIAL_CONFIDENCE`, `evidence_count = 1`. Rows of
      other sources (e.g. `'session'`) are untouched. This is the
      scoped variant L-2 needs so re-running the analyzer doesn't wipe
      assertions learned from past sessions.
      Touches: `src/server/profiles/profile-assertions-repo.ts`
      (extend), `tests/integration/profiles/assertions-repo.test.ts`
      (extend).
      Acceptance:
        - Integration test (gated on `DATABASE_URL` like sibling
          repo tests): seed three rows on a profile —
          two with `source='session'` and one with `source='examples'`.
          Call `replaceAssertionsBySource(profileId, 'examples',
          [<two new items>])`. Assert the two `'session'` rows still
          exist unchanged AND the profile now has exactly two rows
          with `source='examples'` matching the new items at the
          default `0.5/1`.
        - Integration test: `replaceAssertionsBySource(profileId,
           'examples', [])` deletes all `'examples'`-source rows for
          the profile and leaves other-source rows intact.
        - `pnpm typecheck && pnpm test` exit 0.

- [x] T-L2-4: Orchestrator + server action `analyzeExamplesAction`
      Goal: Add a profile-scoped orchestrator
      `src/server/pipeline/run-analyze-examples.ts` exporting
      `runAnalyzeExamples({ userId, profileId, inputs }): Promise<
       | { ok: true; summary: string; count: number; urlErrors:
       Array<{ index: number; error: string }> }
       | { ok: false; error: 'profile_not_found' |
       'too_few_examples' | 'analyze_failed' }>`. `inputs` is
      `Array<{ kind: 'url' | 'text', value: string }>`. Behaviour:
      load profile via `getProfile(userId, profileId)` → return
      `profile_not_found` if missing; for each `kind: 'url'` call
      `fetchExampleUrl` (sequentially is fine — 4 inputs max);
      collect successful contents and `urlErrors` for failures;
      reject with `too_few_examples` when fewer than 3 contents
      survive (per "URL ingestion caveat"); call the stage inside
      `runWithLLMContext({ userId, stage: 'analyze_examples', task:
       'analyze_examples' }, () => analyzeExamples.run(...))` (NOT
      `withStageCtx` — that requires a sessionId which doesn't apply
      here); on success persist via
      `replaceAssertionsBySource(profileId, 'examples', items)` and
      return the summary + count + collected `urlErrors`.
      Then add a thin server action `analyzeExamplesAction(prevState,
      formData)` in `src/app/(app)/profiles/actions.ts` that
      `requireUser`s, parses the form (`profileId` + JSON-encoded
      `inputs`), dispatches the orchestrator, calls
      `revalidatePath('/profiles/[id]/edit', 'page')` on success, and
      returns a typed result the form can render
      (`{ ok: true; summary; urlErrors } | { ok: false; error }`).
      Touches: `src/server/pipeline/run-analyze-examples.ts` (new),
      `src/app/(app)/profiles/actions.ts` (extend),
      `tests/unit/profiles/analyze-examples-action.test.ts` (new),
      `tests/unit/pipeline/run-analyze-examples.test.ts` (new).
      Acceptance:
        - Unit test (orchestrator): mocks `getProfile` → null;
          asserts result is `{ ok: false, error: 'profile_not_found' }`.
        - Unit test (orchestrator): three text inputs + one URL input
          whose fetch fails; asserts the stage runs over the 3 text
          contents and `urlErrors` contains the one failure.
        - Unit test (orchestrator): two text inputs + two URL inputs
          that both fail (only 2 successes); asserts result is
          `{ ok: false, error: 'too_few_examples' }` and the stage is
          not called.
        - Unit test (orchestrator): on success, asserts
          `replaceAssertionsBySource` is called once with `'examples'`
          and the items the stage returned.
        - Unit test (action): asserts the action returns
          `{ ok: false, error: 'profile_not_found' }` when
          `getProfile` returns null and does not call the orchestrator.
        - `pnpm test` passes.
      Notes: keep the URL fetch sequential — input cap is small (≤4)
      and parallelism adds no meaningful win against the 10-s
      per-fetch timeout.

- [x] T-L2-5: "Add examples" form on profile edit page
      Goal: Add a new client component
      `src/app/(app)/profiles/[id]/edit/examples-form.tsx` rendering
      under the Assertions panel on `/profiles/[id]/edit`. The form
      offers exactly four entry slots; each slot has a radio toggle
      between "URL" and "Pasted text" and one input (`<input
      type="url">` or `<textarea>` accordingly). Submit invokes
      `analyzeExamplesAction` via `useActionState`. While pending,
      show a spinner + "Analysing examples…". On result:
      - `ok: true` — show the `summary` paragraph in a bordered card
        above the form, plus a one-line note `"Saved N assertions"`.
        If `urlErrors` is non-empty, show an inline list under the
        offending URL slots (`Slot N: <error>`) and instruct the user
        to paste the article body manually and resubmit.
      - `ok: false, error: 'too_few_examples'` — render an inline
        warning "Provide at least 3 readable examples" without
        clearing user input.
      - `ok: false, error: 'profile_not_found'` — render a generic
        error notice.
      Wire the form into `page.tsx` so it appears below the
      `AssertionsPanel`. The page already revalidates after the
      action's `revalidatePath`, so the assertions list refreshes on
      success.
      Touches: `src/app/(app)/profiles/[id]/edit/examples-form.tsx`
      (new), `src/app/(app)/profiles/[id]/edit/page.tsx` (extend to
      render the form).
      Acceptance:
        - Manual via `pnpm dev`: visiting `/profiles/<id>/edit`
          renders four example slots under the Assertions section
          with URL/text toggles and a submit button.
        - Manual: submit with three pasted texts (and one empty slot)
          triggers the action; pending state shows the spinner; on
          success the summary card and the new examples-source
          assertions appear in the Assertions panel without a manual
          reload.
        - Manual: submit with a clearly-failing URL (e.g.
          `https://this-domain-does-not-exist.invalid/foo`) plus
          three valid pasted texts; the URL slot displays the
          per-slot error from `urlErrors` while analysis still
          completes against the three successful inputs.
        - Manual: submit with only two pasted texts; the inline
          "Provide at least 3 readable examples" warning renders and
          no LLM call is made (verify by absence of new assertions).
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: no new API route — server action pattern matches
      `EditForm`. The summary is intentionally ephemeral (not
      persisted); a reload clears it. Assertions persist via the
      existing panel.

---

## Epic L-3 — Assertion-aware clarification + hidden answer classifier

**Status: planned**

**Goal:** The existing `clarify-brief` stage reads the profile's current
assertions and uses them to suppress questions whose answers are already
known with high confidence (per the policy: `confidence ≥ 0.85` and
`evidence_count ≥ 3`). After the user answers any remaining questions,
a hidden `classify-answers` stage runs, compares answers against the
existing assertions, and upserts/updates the table — applying the
+0.10 / −0.25 / new-row rules from the confidence policy. This
enrichment applies in both full and light mode.

**Intent:** Extend `clarify-brief` to accept an optional
`knownAssertions` array in its input; the LLM prompt instructs the
model to skip a question entirely if the corresponding assertion is
above the skip threshold, and to *bias wording* toward confirmation if
the assertion is below threshold but present.

Implement `classify-answers` as a new
`Stage<ClassifyAnswersInput, ClassifyAnswersOutput>` with
`modelClass: 'fast'`. Its prompt presents Q&A pairs plus the existing
assertion list (full key+category+assertion) and asks the model to
output a structured delta of three kinds: `agree | contradict | new`.
The runner calls this stage immediately after receiving user answers
(in both modes), before angle selection. The user never sees a spinner
or event for this call.

After the LLM delta arrives, a deterministic post-pass:
1. For each `new` item, computes a key-similarity score against existing
   keys; if the score ≥ 0.85 for any existing key, demote it to an
   `agree` against that key (no row is inserted; the existing key is
   reinforced via `recordAgreement`).
2. Applies `agree` / `contradict` / `new` via the L-1 repo helpers.

The repository has no embedding-class router today (see
`src/server/llm/models.ts` — only `smart` / `fast` / `search` /
`image`), so the dedup post-pass uses a deterministic character-bigram
cosine over the descriptive suffixes of keys instead. This is enough to
catch `tone_clickbait` ↔ `clickbait_tone` reorderings without standing
up new infra. Future work can swap in real embeddings once an
embedding class is added.

### Tasks

- [x] T-L3-1: Extend `clarify-brief` to consume `knownAssertions`
      Goal: Widen `clarifyBrief.inputSchema` with an optional
      `knownAssertions: Array<{ key: string; category: string;
       assertion: string; confidence: number; evidenceCount: number }>`
      field. When the array is non-empty, append a "Known assertions
      about this user" block to the system prompt that lists each row
      (`key (category) — "assertion" [confidence × evidence]`). Embed
      the explicit thresholds in the prompt body: instruct the model
      to (a) **skip** any question whose answer is already implied by
      an assertion with `confidence ≥ 0.85` AND `evidenceCount ≥ 3`,
      and (b) for matching assertions below that threshold, **bias the
      wording** toward confirmation/contradiction (still ask). The
      runner is NOT changed in this task — only the stage signature
      and prompt.
      Touches: `src/server/pipeline/stages/clarify-brief.ts`,
      `tests/unit/pipeline/clarify-brief.test.ts`.
      Acceptance:
        - Unit test (extending existing file): captures the `system`
          string passed to `routeJsonChat` and asserts it does NOT
          contain the substring "Known assertions" when
          `knownAssertions` is omitted.
        - Unit test: when called with `knownAssertions =
           [{ key: 'tone_clickbait', category: 'tone', assertion:
           'avoids clickbait', confidence: 0.9, evidenceCount: 5 }]`,
          the captured system prompt contains the assertion text, the
          key `tone_clickbait`, and the literal threshold strings
          `0.85` and `3`.
        - Unit test: pre-existing tests in
          `clarify-brief.test.ts` still pass (no breaking schema
          change — `knownAssertions` is optional, default `[]`).
        - `pnpm typecheck && pnpm test` exit 0.
      Notes: this task is purely the stage signature + prompt. The
      runner-side wiring (loading assertions and feeding them in)
      lands in T-L3-5.

- [x] T-L3-2: Key-similarity helper for assertion dedup
      Goal: New pure module
      `src/server/profiles/key-similarity.ts` exposing two functions:
        - `keySimilarity(a: string, b: string): number` — lowercase
          both keys, strip the leading category prefix
          (`scope_|tone_|format_|structure_|audience_|custom_`) before
          comparing so that `tone_clickbait` and `clickbait_tone` are
          compared on `clickbait` vs `clickbait_tone`. Compute cosine
          similarity over character-bigram bags. Identical inputs
          return `1.0`; inputs that share no bigram return `0.0`.
        - `findSimilarKey(target: string, candidates: string[],
           threshold = 0.85): { key: string; similarity: number } |
           null` — returns the highest-scoring candidate at or above
          `threshold`, or `null` if none.
      Touches: `src/server/profiles/key-similarity.ts` (new),
      `tests/unit/profiles/key-similarity.test.ts` (new).
      Acceptance:
        - Unit test: `keySimilarity('tone_clickbait',
           'tone_clickbait')` is `1.0`.
        - Unit test: `keySimilarity('tone_clickbait',
           'clickbait_tone')` is `≥ 0.85`.
        - Unit test: `keySimilarity('tone_formal', 'tone_casual')` is
          `< 0.85` (shared prefix is not enough).
        - Unit test: `findSimilarKey('tone_clickbait', ['tone_formal',
           'clickbait_tone', 'scope_news'])` returns
          `{ key: 'clickbait_tone', similarity: ≥ 0.85 }`.
        - Unit test: `findSimilarKey('foo', [])` returns `null`.
        - `pnpm test` passes.
      Decision needed: similarity strategy. Default chosen:
      deterministic character-bigram cosine (no model dependency).
      Alternative (real embeddings) is deferred until an embedding
      model class is wired into `src/server/llm/models.ts`.

- [x] T-L3-3: `classify-answers` stage (fast model)
      Goal: New `Stage<ClassifyAnswersInput, ClassifyAnswersOutput>`
      in `src/server/pipeline/stages/classify-answers.ts` with
      `modelClass: 'fast'`. Input shape (zod-validated):
      `{ profile: ProfileRow, qa: Array<{ question: string; answer:
       string }>, existingAssertions: Array<{ key: string; category:
       string; assertion: string; confidence: number; evidenceCount:
       number }> }`. Output shape:
      `{ delta: Array<{ kind: 'agree' | 'contradict' | 'new', key:
       string, category?: 'scope'|'tone'|'format'|'structure'|
       'audience'|'custom', assertion?: string }> }`. Output schema
      MUST require `category` and `assertion` when `kind === 'new'`
      and reject those fields being empty (use a zod
      `superRefine`/discriminated union).
      System prompt: list the seed key prefixes (`scope_`, `tone_`,
      `format_`, `structure_`, `audience_`, `custom_`) verbatim from
      `analyze-examples.ts`'s "Key vocabulary stability" section,
      list the existing assertions, and instruct the model to emit
      `agree` against an existing key when an answer reaffirms it,
      `contradict` when it negates it, and `new` only for genuinely
      novel traits. Use `routeJsonChat({ class: 'fast', ... })`.
      Emit `task_started` then `task_completed` with `stage:
       'classify_answers'` and `count = delta.length`.
      Touches: `src/server/pipeline/stages/classify-answers.ts`
      (new), `tests/unit/pipeline/classify-answers.test.ts` (new).
      Acceptance:
        - Unit test mocks `routeJsonChat` and asserts the stage
          forwards the model's `{ delta }` verbatim when valid.
        - Unit test asserts the stage emits exactly
          `['task_started', 'task_completed']` with
          `stage: 'classify_answers'` and the completion event's
          `count` equals `delta.length`.
        - Unit test asserts the stage's system prompt string contains
          all five seed prefixes (`scope_`, `tone_`, `format_`,
          `structure_`, `audience_`).
        - Unit test asserts `routeJsonChat` is called with
          `class: 'fast'`.
        - Unit test: `outputSchema.safeParse(...)` rejects a `new`
          item missing `assertion`, and accepts an `agree` item with
          only `kind` + `key`.
        - `pnpm typecheck && pnpm test` exit 0.

- [x] T-L3-4: Orchestrator `runClassifyAnswers` with dedup post-pass
      Goal: New module
      `src/server/pipeline/run-classify-answers.ts` exporting
      `runClassifyAnswers({ userId, sessionId, profileId, qa }):
       Promise<{ applied: number; skipped: number }>`. Behaviour:
      1. Load `profile = await getProfile(userId, profileId)`. If
         null, throw `Error('profile_not_found')`.
      2. Load `existingAssertions = await listAssertions(profileId)`.
      3. Build a runner-style `ctx` (emit forwards to `emitEvent`,
         `userInput`/`log`/`llm` are no-ops) and call
         `withStageCtx(classifyAnswers, sessionId, userId, () =>
          classifyAnswers.run({ profile, qa, existingAssertions },
          ctx))`.
      4. Apply each delta item via L-1 repo helpers and the L-3-2
         similarity helper:
         - `agree { key }` → `recordAgreement(profileId, key)`. If it
           returns `null` (key not in DB), increment `skipped`.
         - `contradict { key }` → `recordContradiction(profileId,
           key)`; null → `skipped++`.
         - `new { key, category, assertion }` → call
           `findSimilarKey(key, existingAssertions.map(a => a.key))`.
           If a match is returned, call
           `recordAgreement(profileId, match.key)` instead (treat as
           reinforcement of the existing key) and DO NOT insert.
           Otherwise call `upsertAssertion({ profileId, key,
            category, assertion, source: 'session' })`.
         - For successfully applied items, increment `applied`.
      5. Return `{ applied, skipped }`.
      Touches: `src/server/pipeline/run-classify-answers.ts` (new),
      `tests/unit/pipeline/run-classify-answers.test.ts` (new).
      Acceptance:
        - Unit test mocks `getProfile` returning `null` and asserts
          the orchestrator throws `Error('profile_not_found')`.
        - Unit test mocks the stage to return a single `agree` item
          and asserts `recordAgreement(profileId, key)` is called
          exactly once.
        - Unit test: a single `contradict` item triggers exactly one
          `recordContradiction` call.
        - Unit test: a `new` item whose key has no near-match in
          `existingAssertions` invokes `upsertAssertion` once with
          `source: 'session'` and does NOT call `recordAgreement`.
        - Unit test: a `new` item whose key collides with an existing
          key via `findSimilarKey` (similarity ≥ 0.85) invokes
          `recordAgreement(profileId, similarKey)` exactly once and
          does NOT call `upsertAssertion`.
        - Unit test: an `agree` for a key not present in DB
          (`recordAgreement` returns null) increments `skipped` and
          leaves `applied` at the count of other-applied items.
        - `pnpm typecheck && pnpm test` exit 0.
      Notes: emit events are produced by the stage itself; the
      orchestrator does not emit additional ones. The user-facing
      "silent" behaviour from the epic intent is achieved by the UI
      filtering on `stage: 'classify_answers'` if/when desired —
      that's out of scope for L-3.

- [x] T-L3-5: Wire enrichment into runner planning case
      Goal: Update the `planning` case in
      `src/server/pipeline/runner.ts`:
      1. Before invoking `clarifyBrief.run`, load
         `knownAssertions = await listAssertions(session.profileId)`
         and pass it through the stage input. The existing
         `withStageCtx(clarifyBrief, ...)` wrapper is preserved.
      2. After `clarifications` is collected (existing array of
         `{ question, answer }`), if `clarifications.length > 0` call
         `await runClassifyAnswers({ userId, sessionId, profileId:
          session.profileId, qa: clarifications })`. Wrap the call in
         a `try { ... } catch (err) { console.warn(...); }` block so
         that an enrichment failure does not block planning.
      3. If `clarifications.length === 0` (no questions were asked),
         skip the orchestrator call entirely — there are no answers
         to classify.
      4. No other behaviour change. `proposeAngles`, plan locking,
         and the state advance to `research` run as before.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-planning.test.ts`.
      Acceptance:
        - Unit test (extending existing): mock `listAssertions` to
          return one assertion at `confidence = 0.9`,
          `evidenceCount = 5`. Assert the mocked `clarifyBrief.run`
          receives an input whose `knownAssertions` array contains
          that row.
        - Unit test: mock `clarifyBrief.run` to return one question;
          mock `userInput` to feed an answer; mock
          `runClassifyAnswers` and assert it is called exactly once
          with `qa = [{ question: <q>, answer: <a> }]`.
        - Unit test: when `clarifyBrief.run` returns
          `{ questions: [] }`, `runClassifyAnswers` is NOT called
          (assert mock call count is 0) and the runner still advances
          to `proposeAngles`.
        - Unit test: when `runClassifyAnswers` rejects with a thrown
          error, the runner does NOT rethrow and still calls
          `proposeAngles.run` afterwards (assert via mock call
          ordering and a non-thrown awaited promise).
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: light mode does not yet exist in the runner (introduced
      by L-4). The wiring placed here is mode-agnostic, so when L-4
      adds the `'light'` branch inside the `planning` case the
      assertion-aware clarification + classification carries over
      automatically.

---

## Epic L-4 — Light mode session: profile setting, runner, draft-full

**Status: planned**

**Goal:** A user can create a `mode = 'light'` session, submit a
single-topic brief, answer a short clarification (enriched by L-3), and
watch the pipeline run fully automatically up to the `review` state —
angle auto-picked via `recommendedIndex`, plan auto-locked, research
limited to 0–2 sources, full article drafted in a single LLM call with
a length cap. The session-page UI built in L-5 will sit on top of this;
L-4 is testable via the existing brief / SSE / userInput-respond
endpoints alone.

**Intent:**

*Profile settings (single migration):* add the columns
- `lightResearchSources integer NOT NULL DEFAULT 1` (allowed values 0/1/2)
- `lightMaxWords integer NOT NULL DEFAULT 800` (range 200–2500)
- `sessions.draft_md_pre_review text NULL` (used by L-6, declared here
  to keep migrations grouped)

Expose both light-mode profile settings in the profile create/edit
forms.

*`propose-angles` extension:* output schema gains
`recommendedIndex: number` and `recommendationReason: string`. Full mode
uses these only for highlighting; light mode auto-selects.

*Session creation:* extend the existing `mode` value space from
`'new' | 'rewrite'` to `'new' | 'rewrite' | 'light'` in
`sessions/repo.ts` and the new-session form/action. Existing values are
not renamed. The brief schema (`briefSchema`) needs no change — its
non-`topic` fields already default to empty strings / empty arrays, so
a light brief `{ topic }` parses cleanly. The existing
`submitBriefAction` is reused for light mode (it already advances state
to `planning` and kicks the runner).

*Runner:* extend each existing `case` in `runner.ts` with a
`session.mode === 'light'` branch (do NOT fork the runner into a
separate state machine — same states, divergent behaviour). All stage
calls in this branch MUST go through `withStageCtx(...)` per the
repository invariant. Light-mode behaviour:

1. `planning` — run `clarify-brief` (assertion-aware, already wired by
   L-3), present any returned questions, collect answers, run
   `classify-answers` silently (already wired by L-3), then run
   `propose-angles`, auto-select `angles[recommendedIndex]` (no
   `angle_choice` userInput), run `build-plan`, persist via
   `updateSessionPlan`, advance state directly to `research` (no
   `plan_lock` userInput).
2. `research` — if `profile.lightResearchSources === 0`, skip entirely;
   else issue a single web search with a query derived directly from
   the session topic (no hypothesis planning, no `formulateQueries`),
   keep the top `lightResearchSources` hits by relevance, summarize
   each. No `research_done` userInput; advance state to `drafting`
   immediately.
3. `drafting` — call `draft-full` once; persist `draft_md`; advance to
   `review` immediately (no `draft_done` userInput).
4. `review` — left as a no-op `return` in this epic. L-6 + L-7 fill in
   snapshot → `auto-review` → synthetic `critique_round` →
   `extract-claims` → advance to `done`. L-4's job is just to make sure
   the runner does NOT call `userInput('review_done')` for light mode.
5. `decoration` / `illustration` / `export` — light branch must be
   `return` (no-op) in every one of these state cases. The light runner
   never transitions through them. The hero image (L-8) is dispatched
   asynchronously *after* the session reaches `done` (see L-8). Export
   reuses the same handlers full mode uses, but invoked from the
   `done`-state UI rather than the `export` state.

*`draft-full` stage:* new `Stage<DraftFullInput, DraftFullOutput>` with
`modelClass: 'smart'`. Input: `{ profile, brief, plan, sources, lightMaxWords }`.
Output: `{ contentMd: string, wordCount: number }`. Prompt writes the
complete article in one shot, using the plan's section structure as an
outline and any accepted sources for grounding, respecting the profile's
style/tone/audience and the `lightMaxWords` target. A postprocessing
step truncates the markdown to `lightMaxWords × 1.15` words if
exceeded (cut at the nearest paragraph boundary, append a logging
warning via `ctx.log.append` — *not* visible to the user).

### Tasks

- [x] T-L4-1: Migration — light profile settings + pre-review snapshot column
      Goal: One Drizzle migration adding three columns:
        - `profiles.light_research_sources integer NOT NULL DEFAULT 1`,
        - `profiles.light_max_words integer NOT NULL DEFAULT 800`,
        - `sessions.draft_md_pre_review text NULL`.
      Update `src/server/db/schema.ts` with the matching column
      definitions: `lightResearchSources: integer(...).notNull().default(1)`,
      `lightMaxWords: integer(...).notNull().default(800)`,
      `draftMdPreReview: text('draft_md_pre_review')` (nullable).
      Touches: `src/server/db/schema.ts`,
      `drizzle/0014_<generated>.sql` (new),
      `drizzle/meta/_journal.json`,
      `drizzle/meta/0014_snapshot.json`.
      Acceptance:
        - `pnpm db:generate` produces a migration whose SQL contains
          three `ALTER TABLE ... ADD COLUMN` statements (two on
          `profiles`, one on `sessions`) with the stated types and
          defaults.
        - `pnpm db:migrate` against the compose DB applies the
          migration; re-running is a no-op.
        - `pnpm typecheck` passes with the three new column exports
          (`profiles.lightResearchSources`, `profiles.lightMaxWords`,
          `sessions.draftMdPreReview`).
        - Integration test (gated on `DATABASE_URL` like sibling tests):
          insert a profile via raw SQL with no light_* values supplied,
          read it back, assert `light_research_sources = 1` and
          `light_max_words = 800`.
      Notes: numeric range validation (0–2 for `lightResearchSources`,
      200–2500 for `lightMaxWords`) lives in the zod schema, not in
      SQL — see T-L4-2.

- [x] T-L4-2: Profile zod + create/edit form & actions for light settings
      Goal: Extend `profileInputSchema`
      (`src/server/profiles/schema.ts`) with two new fields (both with
      defaults so existing callers and tests continue to compile):
        - `lightResearchSources: z.number().int().min(0).max(2).default(1)`,
        - `lightMaxWords: z.number().int().min(200).max(2500).default(800)`.
      Update the existing create / update profile actions
      (`src/app/(app)/profiles/actions.ts`) to read the two new
      `FormData` fields and feed them through
      `profileInputSchema.safeParse`. Add two corresponding inputs to
      the new-profile form
      (`src/app/(app)/profiles/new/...` — wherever the existing "new"
      form lives) and the edit form
      (`src/app/(app)/profiles/[id]/edit/edit-form.tsx`): a
      `<select name="lightResearchSources">` with options `0 | 1 | 2`
      and a `<input type="number" name="lightMaxWords" min="200"
       max="2500" step="50">`, both grouped under a clearly labelled
      "Light mode" subsection at the bottom of the form, prefilled
      from `profile.lightResearchSources` / `profile.lightMaxWords`
      respectively.
      Touches: `src/server/profiles/schema.ts`,
      `src/app/(app)/profiles/actions.ts`,
      `src/app/(app)/profiles/[id]/edit/edit-form.tsx`,
      `src/app/(app)/profiles/new/profile-form.tsx`
      (or whichever filename the existing new-profile form uses — file
      to be verified by reading
      `src/app/(app)/profiles/new/page.tsx`),
      `tests/unit/profiles/schema.test.ts` (extend if exists, create
      otherwise).
      Acceptance:
        - Unit test: `profileInputSchema.safeParse({ ... ,
           lightResearchSources: 3 })` fails; same with `-1`.
        - Unit test: `profileInputSchema.safeParse({ ... ,
           lightMaxWords: 199 })` fails; same with `2501`.
        - Unit test: omitting both fields parses successfully and
          returns the documented defaults (`lightResearchSources: 1`,
          `lightMaxWords: 800`).
        - Manual via `pnpm dev`: open `/profiles/<id>/edit`, change
          both fields to e.g. `2` and `1200`, submit, reopen the page,
          observe values persist.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: do not add validation logic to `markup-rules` or other
      existing fields. Range bounds are intentionally enforced at the
      zod boundary (matching how `targetVolume` is currently handled)
      so that DB inserts done outside the action layer (tests, scripts)
      can still use values `0`/`800` without bypassing checks.

- [x] T-L4-3: Extend `propose-angles` with `recommendedIndex` + `recommendationReason`
      Goal: Widen `propose-angles.outputSchema` to
      `{ angles: ..., recommendedIndex: number, recommendationReason:
       string }`. The schema must use a `z.number().int()` constrained
      to `[0, angles.length - 1]` via `superRefine`
      (cross-field check) so an out-of-range model output is rejected.
      Update the system prompt to instruct the model to return
      `recommendedIndex` (best angle for the given brief & profile)
      plus a one-sentence `recommendationReason`. Update existing
      tests in `tests/unit/pipeline/propose-angles.test.ts` to assert
      both new fields are returned and validate the cross-field
      bound. The runner full-mode call site keeps destructuring
      `{ angles }` only (no behaviour change for full mode); update
      the eval fixture
      `tests/eval/fixtures/propose_angles/habr-longread-1.json` to
      include `recommendedIndex` + `recommendationReason` so it still
      passes schema validation.
      Touches: `src/server/pipeline/stages/propose-angles.ts`,
      `tests/unit/pipeline/propose-angles.test.ts`,
      `tests/eval/fixtures/propose_angles/habr-longread-1.json`.
      Acceptance:
        - Unit test: `outputSchema.safeParse({ angles: [a,b],
           recommendedIndex: 0, recommendationReason: 'because' })`
          succeeds; `recommendedIndex: 5` against a 2-element angles
          array fails.
        - Unit test: when `routeJsonChat` is mocked to return a valid
          shape, the stage returns the structure unchanged including
          `recommendedIndex` and `recommendationReason`.
        - Unit test: the captured system prompt contains the literal
          strings `recommendedIndex` and `recommendationReason` so the
          contract is communicated to the model.
        - Existing runner tests
          (`tests/unit/pipeline/runner-planning.test.ts`,
          `runner.test.ts`, `runner-research.test.ts`,
          `runner-drafting.test.ts`,
          `runner-decoration.test.ts`, `runner-illustration.test.ts`,
          `runner-export.test.ts`) still pass without modification —
          they use mocked `proposeAngles.run` results that may omit
          the new fields, which is fine since the runner doesn't
          re-validate stage outputs.
        - `pnpm typecheck && pnpm test` exit 0.
      Notes: do NOT change the runner's full-mode call site in this
      task — auto-selection lives in T-L4-6. Only the stage and its
      schema move here.

- [x] T-L4-4: Extend session `mode` value space to include `'light'`
      Goal: Update `createSession` in
      `src/server/sessions/repo.ts` so its input parameter type is
      `{ profileId: number; mode: 'new' | 'rewrite' | 'light' }`.
      Add (or update) a corresponding zod literal union schema, e.g.
      `sessionModeSchema = z.union([z.literal('new'), z.literal('rewrite'),
       z.literal('light')])`, exported from
      `src/server/sessions/repo.ts` (no separate file needed). Search
      the codebase for any other `'new' | 'rewrite'` / explicit mode
      checks that need broadening (`grep -rn "'new' | 'rewrite'"
       src/`); update each so a `'light'` session is not rejected by
      type guards. **Do NOT** change behaviour anywhere except where
      the type was previously narrower than the actual data — runner
      branches land in later tasks.
      Touches: `src/server/sessions/repo.ts`,
      any other files surfaced by the grep above (likely
      `src/app/(app)/sessions/actions.ts`,
      `src/app/(app)/sessions/[id]/...` parsers),
      `tests/unit/sessions/create-session.test.ts` (extend if exists,
      create otherwise).
      Acceptance:
        - Unit test: `createSession(userId, { profileId, mode:
           'light' })` (with mocked DB layer) does not throw a type
          or runtime error and inserts a row with `mode = 'light'`.
        - `pnpm typecheck` passes after the change — i.e. all
          previously-narrowed call sites compile against the widened
          union.
        - Existing tests for `mode: 'new' | 'rewrite'` still pass.
      Notes: brief schema is intentionally NOT touched — its existing
      defaults for `goal`, `notes`, `sourceArticles` mean a light
      brief `{ topic }` parses cleanly through `submitBriefAction`.

- [x] T-L4-5: New-session form & action accept `mode='light'`
      Goal: Add `'light'` as a third option to the `<select
       name="mode">` in
      `src/app/(app)/sessions/new/new-session-form.tsx` (label e.g.
      "Light mode (auto-pilot)"). Update
      `src/app/(app)/sessions/actions.ts` `createSessionAction` to
      accept `mode === 'light'` in its validation guard (the
      `mode !== 'new' && mode !== 'rewrite'` rejection becomes a
      whitelist `!['new','rewrite','light'].includes(mode)`). The
      action continues to redirect to `/sessions/<id>` after creation;
      the session lands in `briefing` state by default — light-mode UX
      then expects the existing `/sessions/[id]` page (briefing form)
      to accept a topic. Per the L-5 epic, the topic-only briefing
      view is L-5's concern; for L-4 the existing
      `submitBriefAction` already handles `{ topic }` correctly.
      Touches: `src/app/(app)/sessions/new/new-session-form.tsx`,
      `src/app/(app)/sessions/actions.ts`,
      `tests/unit/sessions/create-session-action.test.ts`
      (new or extend if a sibling exists).
      Acceptance:
        - Unit test: `createSessionAction` with FormData containing
          `mode='light'` and a valid `profileId` resolves through
          (mock `createSession` to capture the call) and the
          underlying `createSession` is called with `mode: 'light'`.
        - Unit test: `createSessionAction` with `mode='other'`
          returns `{ ok: false, error: 'validation' }`.
        - Manual via `pnpm dev`: from `/sessions/new` the dropdown
          shows three options; selecting "Light mode" + a profile and
          submitting redirects to `/sessions/<id>` and the row in DB
          has `mode = 'light'`, `state = 'briefing'`.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: `submitBriefAction` already kicks the runner via
      `startRunner`; once the new runner branches from T-L4-6/7/8 are
      in place, a light session will progress automatically the moment
      the user submits a topic.

- [x] T-L4-6: `draft-full` stage with length-cap postprocessor
      Goal: New stage `draftFull: Stage<DraftFullInput,
       DraftFullOutput>` in
      `src/server/pipeline/stages/draft-full.ts` with `modelClass:
       'smart'`. Input shape (zod-validated):
      `{ profile: ProfileRow, brief: BriefInput, plan: Plan, sources:
       Array<{ url: string, title: string, summary: string,
       rawExcerpt: string }>, lightMaxWords: number }`. Output shape:
      `{ contentMd: string, wordCount: number }`. System prompt:
      describe the assignment (full article in one shot using the
      plan's `sections` as an outline; respect profile style/tone/
      audience + `extraPrompt`; cite sources by URL inline only if
      relevant; target `lightMaxWords` words ±10%; emit clean Markdown
      headings). Use `routeJsonChat({ class: 'smart', ... })` with an
      output schema that's just `{ contentMd: string }` — `wordCount`
      is computed deterministically from the post-processed markdown
      after truncation.
      Postprocessor (called inside `run`, after the LLM response):
      split on `/\s+/` to count words; if `count > lightMaxWords *
       1.15`, walk paragraph boundaries (`\n\n`) from the start and
      cut at the largest prefix whose word count is `≤ lightMaxWords`
      then append `ctx.log.append({ event: 'draft_full_truncated',
       originalWords: count, finalWords: <new>, cap:
       lightMaxWords })`. `wordCount` returned to the caller is the
      post-truncation count.
      Emit `task_started` and `task_completed` (with `stage:
       'draft_full'` and `wordCount`) per the existing stage
      convention.
      Touches: `src/server/pipeline/stages/draft-full.ts` (new),
      `tests/unit/pipeline/draft-full.test.ts` (new).
      Acceptance:
        - Unit test mocks `routeJsonChat` to return a 300-word
          markdown string with `lightMaxWords = 800`; asserts the
          stage returns the markdown unchanged and `wordCount = 300`,
          and that no truncation log was emitted.
        - Unit test mocks `routeJsonChat` to return 1200 words with
          `lightMaxWords = 800` (cap = 920); asserts the returned
          `contentMd` has `≤ 920` words AND ends at a paragraph
          boundary (i.e. `contentMd` contains no trailing partial
          paragraph), and that exactly one
          `ctx.log.append({ event: 'draft_full_truncated', ... })`
          call was made with `originalWords = 1200`.
        - Unit test asserts the stage emits exactly
          `['task_started', 'task_completed']` with
          `stage: 'draft_full'` on completion and a
          numeric `wordCount` field.
        - Unit test asserts `routeJsonChat` is called with
          `class: 'smart'`.
        - Unit test: `inputSchema.safeParse({ ... ,
           lightMaxWords: 100 })` fails (below the 200 floor) — the
          stage's input schema should mirror the profile zod range.
        - `pnpm typecheck && pnpm test` exit 0.
      Notes: this stage is NOT yet called by the runner. T-L4-9 wires
      it in. Sources are passed through as a flat list rather than
      per-section because light mode does not split by section.

- [x] T-L4-7: Runner — `planning` light-mode branch
      Goal: Inside `case 'planning':` in
      `src/server/pipeline/runner.ts`, fork on `session.mode === 'light'`
      after parsing `brief` / `profile` (i.e. share the existing
      `briefParsed` / `profile` setup). The light branch:
      1. Calls `clarifyBrief.run` exactly the same way the existing
         code does (assertion-aware: `knownAssertions = await
          listAssertions(session.profileId)` is already wired).
      2. If `questions.length > 0`, emits the existing
         `artifact_updated { kind: 'questions', ... }` event, awaits
         `userInput('clarify', ...)` exactly as full mode does, builds
         `clarifications`, then runs `runClassifyAnswers` inside the
         existing try/catch (same wiring as full mode).
      3. Calls `proposeAngles.run` (wrapped in `withStageCtx`),
         **picks `angles[result.recommendedIndex]` automatically** —
         no `userInput('angle_choice', ...)`. Emit
         `artifact_updated { kind: 'angles', angles, recommendedIndex,
          recommendationReason }` so the L-5 UI can show the choice.
      4. Calls `buildPlan.run` (wrapped in `withStageCtx`),
         persists via `updateSessionPlan`, emits
         `artifact_updated { kind: 'plan', plan }`.
      5. Calls `updateSessionState(userId, sessionId, 'research')` and
         emits `state_changed { state: 'research' }`. Then
         `await startRunner(sessionId, userId, true)` — same
         self-recursion full mode uses.
      The full-mode branch is otherwise unchanged.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-planning.test.ts` (extend with
      light-mode cases).
      Acceptance:
        - Unit test: `session.mode = 'light'` with
          `clarifyBrief.run → { questions: [] }`,
          `proposeAngles.run → { angles: [a,b,c], recommendedIndex: 1,
           recommendationReason: 'r' }`, `buildPlan.run → plan`.
          Assert: NO `userInput('angle_choice', ...)` is requested
          (the test's `pendingInputs` map remains empty after
          planning), `buildPlan.run` is called with `angle = a[1]`
          (the recommended one), `updateSessionPlan` is called with
          the plan, `updateSessionState(..., 'research')` is called,
          and `startRunner(...)` is called recursively (mock
          `startRunner` to count invocations).
        - Unit test: `session.mode = 'light'` with one question
          returned; assert `userInput('clarify', ...)` IS requested
          (light mode keeps the clarification gate), but
          `userInput('plan_lock', ...)` is NEVER requested.
        - Unit test: `session.mode = 'light'`, all stages succeed,
          `pendingInputs` for `'plan_lock'` is empty after the test
          (light mode never gates on plan lock).
        - Existing full-mode runner-planning tests still pass
          unchanged (verify by running `pnpm test
           runner-planning.test`).
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: do NOT introduce `lightMaxWords` / `lightResearchSources`
      reads here — those land in the `research` and `drafting`
      branches.

- [x] T-L4-8: Runner — `research` light-mode branch
      Goal: Inside `case 'research':` in
      `src/server/pipeline/runner.ts`, fork on `session.mode ===
       'light'` after parsing `plan` / `profile`. The light branch:
      1. If `profile.lightResearchSources === 0` — emit
         `artifact_updated { kind: 'research_skipped' }`, advance
         state to `'drafting'`, recurse into `startRunner`. No LLM
         calls.
      2. Else — derive a single search query directly from
         `briefParsed.data.topic` (use the topic verbatim as the
         query string) and call `webSearch.run` once (wrapped in
         `withStageCtx`). Take the top `profile.lightResearchSources`
         hits sorted by their position in the result list. For each
         retained hit, call `summarizeSource.run` (wrapped in
         `withStageCtx`); persist via `insertSource` with `status =
          'accepted'` (light mode auto-accepts — no review gate); emit
         `artifact_updated { kind: 'source', source }` per hit.
         **Skip `planSearchHypotheses` and `formulateQueries`
         entirely.**
      3. Advance state to `'drafting'`, emit `state_changed`, recurse
         into `startRunner`. No `userInput('research_done', ...)`.
      The full-mode branch is otherwise unchanged.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-research.test.ts` (extend).
      Acceptance:
        - Unit test: `session.mode = 'light'`,
          `profile.lightResearchSources = 0`. Assert no
          `webSearch.run` call, no `summarizeSource.run` call, state
          transitions to `'drafting'`, and a `research_skipped` event
          is emitted.
        - Unit test: `session.mode = 'light'`,
          `profile.lightResearchSources = 2`,
          `webSearch.run → { hits: [h1,h2,h3] }`. Assert
          `summarizeSource.run` is called exactly twice (top 2 hits),
          `insertSource` is called twice with `status: 'accepted'`,
          `planSearchHypotheses.run` and `formulateQueries.run` are
          NOT called.
        - Unit test: light branch never requests
          `userInput('research_done', ...)` (assert
          `pendingInputs.has(sessionId)` is false after the runner
          finishes).
        - Existing full-mode research tests still pass.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: deliberately ignore the relevance threshold used in
      full mode (`relevanceScore >= 70 → 'accepted'`). Light mode
      auto-accepts the top-N hits because the user has no review UI
      to act on per-source decisions in this flow.

- [x] T-L4-9: Runner — `drafting` light branch + post-review no-op branches
      Goal: Two changes in `src/server/pipeline/runner.ts`:
      1. **`case 'drafting':` light branch.** After parsing `plan` /
         `brief` / `profile`, if `session.mode === 'light'`:
         - Load `acceptedSources` via `listSessionSources` (filter
           `status === 'accepted'`) and pass them to `draftFull.run`
           (wrapped in `withStageCtx`) along with `profile`, `brief`,
           `plan`, and `lightMaxWords: profile.lightMaxWords`.
         - Persist the returned `contentMd` via `updateSessionDraft`
           and emit `artifact_updated { kind: 'full_draft', contentMd,
            wordCount }`.
         - Advance state to `'review'`, emit `state_changed`, recurse
           into `startRunner`. **No `userInput('draft_done', ...)`**.
         - Do NOT use the section-by-section loop or
           `upsertSectionDraft` for light mode.
      2. **Post-review no-op branches.** In each of `case 'review':`,
         `case 'decoration':`, `case 'illustration':`, `case
          'export':` — at the very top of the case body, add
         `if (session.mode === 'light') { return; }`. This makes the
         light runner stop at `review` after T-L4-9 (until L-6/L-7
         fill in the auto-review path). The decoration / illustration
         / export cases must never run for light mode — full-mode
         behaviour is unchanged.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-drafting.test.ts` (extend),
      `tests/unit/pipeline/runner-review.test.ts` (extend),
      `tests/unit/pipeline/runner-decoration.test.ts`,
      `tests/unit/pipeline/runner-illustration.test.ts`,
      `tests/unit/pipeline/runner-export.test.ts` (extend each with
      one light-mode no-op case).
      Acceptance:
        - Unit test (drafting): `session.mode = 'light'`,
          `profile.lightMaxWords = 800`, `draftFull.run → { contentMd:
           '...', wordCount: 700 }`. Assert `draftFull.run` is called
          exactly once with `lightMaxWords: 800`,
          `draftSection.run` is NOT called, `updateSessionDraft` is
          called with the returned `contentMd`,
          `updateSessionState(..., 'review')` is called,
          `startRunner` recurses.
        - Unit test (drafting): light branch never requests
          `userInput('draft_done', ...)`.
        - Unit test (review): `session.mode = 'light'`, `state =
           'review'`. Assert NO `userInput` is requested, NO state
          advance happens, the function returns cleanly.
        - Unit tests (decoration / illustration / export, one each):
          `session.mode = 'light'` — assert immediate return with no
          `userInput`, no state advance, no events emitted.
        - Existing full-mode tests for all five cases still pass.
        - End-to-end manual smoke (optional but recommended): with
          `pnpm dev` running, create a light session, submit a topic,
          answer any questions, observe that the SSE stream emits
          `state_changed: research → drafting → review` automatically
          and the runner halts at `review` (no exception, no further
          events). The final `sessions.draft_md` column contains the
          generated article.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: the L-4 epic ends with the runner halted at `review`
      state for light mode. L-6 will then add the auto-review +
      snapshot logic inside the light branch of `case 'review':`,
      replacing the early `return` from this task.

---

## Epic L-5 — Light mode session page UI

**Status: planned**

**Goal:** When `session.mode === 'light'`, the session page renders a
purpose-built single-pane view that replaces the multi-pane workbench:
topic input → clarification → progress stream → final article. Hooks
for hero image (L-8), claims panel (L-7), and revert button (L-6) are
present as placeholders so later epics only fill them in.

**Intent:** A new `LightSessionPane` component with state→view mapping:
- `briefing` → `LightBriefForm` (single topic field + submit)
- `planning` → clarification Q&A inline (questions arrive via SSE
  `artifact_updated { kind: 'questions' }`)
- `research` / `drafting` / `review` → compact status bar with current
  stage name and spinner; no manual controls
- `done` → `LightResultPane`: full article markdown rendered as HTML,
  hero image slot above the fold (placeholder card until L-8), claims
  panel slot (placeholder until L-7), revert-to-pre-review button slot
  (disabled until L-6 lands `draft_md_pre_review`), copy-to-clipboard +
  export buttons.

The chat pane on the right continues to show the event stream as in
standard mode. No new API routes — existing SSE and respond endpoints
serve both modes.

### Tasks

- [x] T-L5-1: `LightBriefForm` — single-topic briefing input
      Goal: New client component
      `src/app/(app)/sessions/[id]/light-brief-form.tsx` rendering a
      minimal one-field form: a labelled `<input name="topic" required
       maxLength={200}>` and a submit button "Start writing". Uses the
      same `useActionState`-driven pattern as the existing `BriefForm`
      and dispatches the existing
      `submitBriefAction(sessionId, formData)` exported from
      `./actions`. Validation errors (`{ ok: false, error:
       'validation', issues }`) render inline above the input. While
      pending, the button shows "Starting…" and is disabled. The form
      MUST NOT render goal / notes / sourceArticles fields — light
      mode drops those entirely (`briefSchema` already defaults them
      to empty values, so the action accepts a topic-only submission
      cleanly per L-4-4 / L-4-5).
      Touches: `src/app/(app)/sessions/[id]/light-brief-form.tsx`
      (new), `tests/unit/sessions/light-brief-form.test.ts` (new).
      Acceptance:
        - Component test (mirror `tests/unit/sessions/export-pane.test.ts`
          pattern: mock `./actions` with `vi.mock`,
          `renderToString(React.createElement(LightBriefForm,
           { sessionId: 7 }))`): asserts the rendered HTML contains
          `name="topic"`, `required`, `maxLength="200"`, the button
          label `Start writing`, and does NOT contain `name="goal"`,
          `name="notes"`, or `sourceArticles`.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: action wiring is identical to `BriefForm` — copy the
      `useActionState` boilerplate verbatim, just drop the extra
      fields. No new server-side code in this task.

- [x] T-L5-2: `LightProgressBar` — compact stage indicator for in-flight states
      Goal: New client component
      `src/app/(app)/sessions/[id]/light-progress-bar.tsx` exporting
      `LightProgressBar({ state }: { state: 'planning' | 'research'
       | 'drafting' | 'review' })`. Renders a single horizontal row:
      a small spinner (reuse the `<Spinner />` SVG markup from
      `chat-pane.tsx` — duplicate the inline `<svg>` rather than
      extracting a shared module to keep the change small) plus a
      label per state pulled from a fixed map:
      `{ planning: 'Planning…', research: 'Researching sources…',
         drafting: 'Writing draft…', review: 'Reviewing draft…' }`.
      No SSE subscription, no buttons. Pure presentational.
      Touches:
      `src/app/(app)/sessions/[id]/light-progress-bar.tsx` (new),
      `tests/unit/sessions/light-progress-bar.test.ts` (new).
      Acceptance:
        - Component test (`renderToString` pattern):
          `LightProgressBar({ state: 'research' })` renders
          `Researching sources…` and the SVG `animate-spin` class.
        - Component test: `state: 'drafting'` renders
          `Writing draft…`.
        - Component test: `state: 'review'` renders
          `Reviewing draft…`.
        - Component test: `state: 'planning'` renders `Planning…`.
        - `pnpm typecheck && pnpm test` exit 0.
      Notes: deliberately a single component covering all four
      in-flight states rather than four siblings, to keep the
      state→view map in `LightSessionPane` (T-L5-4) trivial.

- [x] T-L5-3: `LightResultPane` — done-state article view with placeholder slots
      Goal: New client component
      `src/app/(app)/sessions/[id]/light-result-pane.tsx` exporting
      `LightResultPane({ sessionId, draftMd, previewHtml,
       draftMdPreReview }: { sessionId: number; draftMd: string;
       previewHtml: string | null; draftMdPreReview: string | null })`.
      Layout (top → bottom):
      1. **Hero image slot** — a `<div data-slot="hero-image">` with
         a fixed-aspect placeholder card containing the muted text
         "Hero image generating…". L-8 will swap this in via SSE.
         For L-5 it stays static — the data-slot attribute is the
         contract for L-8 to query.
      2. **Article preview** — when `previewHtml` is non-null, render
         a sandboxed iframe identical to `ExportPane` (`title="Article
          preview"`, `sandbox="allow-same-origin"`, `srcDoc={previewHtml}`,
         `min-h-[60vh]`). When null, render the muted text "No article
         yet".
      3. **Action row** — three buttons inline:
         - "Copy markdown" — `onClick` invokes
           `navigator.clipboard.writeText(draftMd)`; on success, the
           button label flips to "Copied!" for 1.5 s (use
           `setTimeout`).
         - "Revert to pre-review" — disabled when `draftMdPreReview
            == null` with title attribute "Pre-review snapshot not
           available". L-6 will activate this; for L-5 it's a slot.
           No onClick handler in L-5.
         - Four download links matching `ExportPane`'s export grid:
           `Markdown (.zip)`, `HTML (.zip)`, `DOCX`, `PDF`, each
           pointing to `/api/sessions/${sessionId}/export?format=<fmt>`
           with `download` attr.
      4. **Claims panel slot** — a `<div data-slot="claims-panel">`
         rendering the muted text "Claims will appear here once
         extracted." L-7 will swap this in.
      Touches:
      `src/app/(app)/sessions/[id]/light-result-pane.tsx` (new),
      `tests/unit/sessions/light-result-pane.test.ts` (new).
      Acceptance:
        - Component test (`renderToString` pattern, mock `./actions`
          if needed): with `previewHtml = '<p>hi</p>'`,
          `draftMdPreReview = null`, asserts the HTML contains
          `data-slot="hero-image"`, `data-slot="claims-panel"`, an
          `<iframe` with `srcDoc=` and `title="Article preview"`,
          a button labelled `Revert to pre-review` with the
          `disabled` attribute present, and links with
          `href="/api/sessions/42/export?format=md"` /
          `format=pdf` etc.
        - Component test: with `previewHtml = null`, asserts the
          fallback `No article yet` text renders and no `<iframe`
          is emitted.
        - Component test: with `draftMdPreReview = 'old text'`,
          asserts the revert button's `disabled` attribute is NOT
          present (the L-6 hookup is out of scope here, but the
          enable/disable contract must already be exercised).
        - `pnpm typecheck && pnpm test` exit 0.
      Notes: copy-to-clipboard fallback (`document.execCommand`) is
      out of scope — modern browsers are assumed. The `data-slot`
      attributes are the integration seams for L-7/L-8; do not
      replace them with comments.

- [x] T-L5-4: `LightSessionPane` — top-level state→view orchestrator
      Goal: New client component
      `src/app/(app)/sessions/[id]/light-session-pane.tsx` exporting
      `LightSessionPane({ sessionId, state, draftMd, previewHtml,
       draftMdPreReview, isRewrite }: { sessionId: number; state:
       SessionState; draftMd: string; previewHtml: string | null;
       draftMdPreReview: string | null; isRewrite: false })`. The
      `isRewrite: false` literal is intentional — light mode never
      runs in rewrite mode (per L-4 the brief is topic-only; rewrite
      input would be ignored). The component:
      1. Subscribes to events via `useSessionEvents(sessionId)` ONLY
         to detect clarification questions (the page itself
         re-renders on `state_changed` thanks to the existing
         `chat-pane.tsx` `router.refresh()` call).
      2. Maintains local state `latestPrompt: string | null` and
         `questions: ClarifyQuestion[]` derived from the event
         stream the same way `PlanningPane` does today (lines 14-39
         of `planning-pane.tsx`).
      3. Renders by switch:
         - `state === 'briefing'` → `<LightBriefForm sessionId={...} />`.
         - `state === 'planning'` → if `latestPrompt === 'clarify'`
           AND `questions.length > 0`, render `<ClarificationForm
            questions={questions} sessionId={...} />` (re-uses the
           existing component verbatim); else render
           `<LightProgressBar state="planning" />`.
         - `state === 'research'` / `'drafting'` / `'review'` →
           `<LightProgressBar state={state} />`.
         - `state === 'done'` → `<LightResultPane sessionId draftMd
            previewHtml draftMdPreReview />`.
         - Any other state (`decoration` / `illustration` /
           `export` — should never occur in light mode per L-4-9 but
           defend against it) → render the muted text
           `Unexpected state: <state>`.
      Touches:
      `src/app/(app)/sessions/[id]/light-session-pane.tsx` (new),
      `tests/unit/sessions/light-session-pane.test.ts` (new).
      Acceptance:
        - Component test (`renderToString` pattern with `useEffect`
          / `EventSource` stubbed via the existing test harness —
          since `useSessionEvents` calls `new EventSource` inside a
          `useEffect`, server-rendered output starts with
          `events = []`, which is exactly the initial state the test
          needs): with `state = 'briefing'`, asserts the HTML
          contains `name="topic"` (delegates to `LightBriefForm`).
        - Component test: with `state = 'research'`, asserts
          `Researching sources…` is rendered.
        - Component test: with `state = 'done'`,
          `previewHtml = '<p>x</p>'`,
          `draftMdPreReview = null`, asserts `data-slot="hero-image"`
          and a download link for `format=md` are both present.
        - Component test: with `state = 'decoration'` (the defensive
          branch), asserts `Unexpected state: decoration` renders.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: do NOT subscribe to `state_changed` here — let the
      page-level `router.refresh()` from `chat-pane.tsx` re-render
      the server component which re-passes `state` as a prop. This
      avoids two competing sources of truth for the current state.

- [x] T-L5-5: Wire `LightSessionPane` into the session page server component
      Goal: Update
      `src/app/(app)/sessions/[id]/page.tsx` so that when
      `session.mode === 'light'`, the workbench column renders
      `<LightSessionPane ... />` instead of the existing per-state
      switch. Implementation outline:
      1. Add an early branch immediately after the `if (!session)
          notFound();` line:
          ```ts
          if (session.mode === 'light') {
            let lightPreviewHtml: string | null = null;
            if (session.state === 'done') {
              const profile = await getProfile(user.id, session.profileId);
              if (profile) {
                const rules = parseMarkupRules(profile.markupRules);
                lightPreviewHtml = await renderHtmlArticle(
                  session.draftMd ?? '', rules,
                );
              }
            }
            return (
              <div className="flex h-full gap-4">
                <div className="flex-1 min-h-0 border rounded flex flex-col overflow-hidden">
                  <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-gray-500">Light mode</h2>
                    <SessionHeader sessionId={id} />
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4">
                    <LightSessionPane
                      sessionId={id}
                      state={session.state}
                      draftMd={session.draftMd ?? ''}
                      previewHtml={lightPreviewHtml}
                      draftMdPreReview={session.draftMdPreReview ?? null}
                      isRewrite={false}
                    />
                  </div>
                </div>
                <div className="w-72 shrink-0 flex flex-col border rounded overflow-hidden">
                  <ChatPane sessionId={id} />
                </div>
              </div>
            );
          }
          ```
      2. The full-mode rendering below this branch is **completely
         unchanged**; light sessions never reach the heavy
         per-state data loads (`researchSources`, `draftingPlan`,
         `decorationData`, `illustrationData`, `reviewData`,
         `exportPreviewHtml`).
      3. Keep the `void startRunner(id, user.id);` recovery call
         BEFORE the new branch so light sessions also benefit from
         it. The DevResetPanel remains full-mode-only — do not
         render it in the light branch.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`.
      Acceptance:
        - Manual smoke via `pnpm dev`: create a light-mode session
          from `/sessions/new`. The session page renders the topic
          form (no goal / notes / source articles fields). Submit
          a topic. The chat pane streams `state_changed` events;
          the workbench transitions through `Planning…` (then
          clarification form when questions arrive) →
          `Researching sources…` → `Writing draft…` →
          `Reviewing draft…`. Because L-6/L-7 are not yet
          implemented, the runner halts in `review` state per
          L-4-9 — verify the workbench shows
          `Reviewing draft…` and remains there (no error). For
          this manual smoke, force-update the row to `state =
          'done'` via SQL (`UPDATE sessions SET state = 'done'
          WHERE id = ?`) and `pnpm dev` reload — the result pane
          renders with the article iframe, copy button, four
          export links, the disabled revert button, and the two
          placeholder slots.
        - Manual smoke: existing full-mode (`mode = 'new'` /
          `'rewrite'`) sessions render exactly as before — this
          is verifiable by opening any pre-existing session in the
          DB and confirming `BriefForm` / `PlanningPane` / etc.
          still appear.
        - Existing tests for the full-mode page rendering
          continue to pass (`pnpm test` runs all suites; no
          test in `tests/unit/sessions/` exercises the page
          component directly today, so the gate is "no regressions
          in test count").
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: this task is intentionally rendering-only. The actual
      light runner already advances through states (L-4-7 → L-4-9);
      L-5-5 just gives those state changes a face. After L-6 / L-7
      land, the same `LightSessionPane` will continue to work
      because they only mutate behaviour inside the runner and
      add SSE events the existing components already render
      (clarification questions are the only event the pane reads
      directly; the result pane's slots are filled by L-7 / L-8 in
      their own UI tasks).

---

---

## Epic L-6 — Light auto-review with pre-review snapshot

**Status: planned**

**Goal:** When a light session reaches the `review` state the runner
automatically (a) snapshots the current draft into `draft_md_pre_review`,
(b) runs a single lightweight review pass focused on humanity and
logical coherence, (c) overwrites `draft_md` with the revised version,
(d) emits a structured change summary, and (e) advances the session.
The result UI's revert button becomes active.

**Intent:** Implement `auto-review` as
`Stage<AutoReviewInput, AutoReviewOutput>` with `modelClass: 'smart'`
in `pipeline/stages/auto-review.ts`. Input: `{ profile, draftMd }`.
The LLM acts as a final editor: identify passages that read as
AI-generated or logically unclear, and output a revised full draft.
Output:
`{ revisedMd: string, changes: Array<{ kind: 'humanize' | 'clarify' | 'cut', before: string, after: string, note?: string }> }`.

`changeCount` (used in events) = `changes.length`. Definition is
mechanical, not "diff lines".

A new orchestrator `pipeline/run-auto-review.ts` (parallels
`run-fact-check.ts`) wraps the call. Stage invocation uses
`withStageCtx(autoReview, sessionId, userId, () => ...)` per the
repository invariant.

*Schema migration:* add `sessions.draft_md_pre_review text NULL`. This
column is **distinct** from existing `revisedDraftMd` /
`revisionStatus` (those store *pending* full-mode revisions awaiting
accept/reject). `draft_md_pre_review` stores the *original* draft so
the user can revert auto-review's rewrite.

Runner sequence in `review` state for `mode === 'light'`:
1. `UPDATE sessions SET draft_md_pre_review = draft_md WHERE id = ?`
   (only if `draft_md_pre_review IS NULL` to preserve the very first
   pre-review version on re-runs).
2. Call `runAutoReview(session)` — wraps `auto-review` in
   `withStageCtx`.
3. `UPDATE sessions SET draft_md = ?` with `revisedMd`.
4. Emit `artifact_updated` `{ kind: 'auto_review_applied',
   changeCount, changes }`.
5. Advance to L-7 substeps (still in `review` state) — claims
   extraction + synthetic round creation; only after L-7 the runner
   advances state to `done`.

No `critique_findings` rows are created by L-6 itself — auto-review is
a direct rewrite, not a structured finding flow. (L-7 *does* create one
synthetic `critique_round` row to host the extracted claims; see L-7.)

### Tasks

- [x] T-L6-1: `auto-review` stage (smart model)
      Goal: New stage `autoReview: Stage<AutoReviewInput, AutoReviewOutput>`
      in `src/server/pipeline/stages/auto-review.ts` with
      `modelClass: 'smart'`. Input shape (zod-validated):
      `{ profile: ProfileRow, draftMd: string }`.
      Output shape (zod-validated):
      `{ revisedMd: string, changes: Array<{ kind: z.enum(['humanize', 'clarify', 'cut']), before: string, after: string, note: z.string().optional() }> }`.
      System prompt: instruct the model to act as a final human editor
      — identify passages that sound AI-generated, are logically
      unclear, or are redundant; rewrite the full article addressing
      those issues; and emit a structured `changes` list describing
      each edit (using `kind: 'humanize' | 'clarify' | 'cut'`). The
      prompt must mention the profile's `style`, `audience`, and
      `extraPrompt` so the rewrite stays on-profile. Instruct the
      model to emit the complete revised article as `revisedMd` (not
      a diff) so callers can directly replace `draft_md`. Use
      `routeJsonChat({ class: 'smart', ... })` (same pattern as
      `extract-claims.ts`). Emit `task_started { stage: 'auto_review' }`
      then `task_completed { stage: 'auto_review', changeCount }`.
      Touches: `src/server/pipeline/stages/auto-review.ts` (new),
      `tests/unit/pipeline/auto-review.test.ts` (new).
      Acceptance:
        - Unit test mocks `routeJsonChat` to return a valid
          `{ revisedMd, changes }` and asserts the stage returns those
          values unchanged.
        - Unit test asserts the stage emits exactly
          `['task_started', 'task_completed']` with
          `stage: 'auto_review'` and `changeCount = changes.length`
          on the completion event.
        - Unit test asserts `routeJsonChat` is called with
          `class: 'smart'`.
        - Unit test: `outputSchema.safeParse({ revisedMd: 'ok',
           changes: [{ kind: 'invalid', before: 'x', after: 'y' }] })`
          fails (invalid `kind` enum value).
        - Unit test: `outputSchema.safeParse({ revisedMd: 'ok',
           changes: [{ kind: 'humanize', before: 'x', after: 'y' }] })`
          succeeds; `note` is optional and its absence is valid.
        - Unit test: the captured system prompt string contains the
          profile's `style`, `audience`, and `extraPrompt` fields so
          the on-profile contract is exercised.
        - `pnpm typecheck && pnpm test` exit 0.
      Notes: `revisedMd` is the complete replacement for `draft_md` —
      the caller does no merging. The `before`/`after` strings are
      short excerpts for the change summary UI; the model is instructed
      to keep them under 200 chars each.

- [x] T-L6-2: Repo: `updateSessionDraftPreReview`
      Goal: Add `updateSessionDraftPreReview(userId: number, id: number,
       snapshotMd: string): Promise<SessionRow | null>` to
      `src/server/sessions/repo.ts`. Implementation: `UPDATE sessions
      SET draft_md_pre_review = ?, updated_at = now() WHERE id = ?
      AND user_id = ?` — same shape as `updateSessionDraft`. This is
      the only writer for `draft_md_pre_review`; the runner calls it
      once, guarded by the "only if NULL" check (guard lives in the
      runner, not here).
      Touches: `src/server/sessions/repo.ts` (extend),
      `tests/unit/sessions/update-draft-pre-review.test.ts` (new).
      Acceptance:
        - Unit test: `updateSessionDraftPreReview` (with mocked DB)
          resolves to the updated row when the session exists and is
          owned by the user; resolves to `null` when the session is
          not found.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: the "only if NULL" snapshot guard belongs in the runner
      (T-L6-3), not here. The `createCritiqueRound`/`listSessionRounds`
      `kind` union is **not** widened in L-6 — auto-review creates no
      critique-round row. Any widening needed for L-7's synthetic
      claims-round belongs in L-7, under the kind L-7 actually uses.

- [x] T-L6-3: `runAutoReview` orchestrator
      Goal: New module
      `src/server/pipeline/run-auto-review.ts` exporting
      `runAutoReview({ sessionId, userId }): Promise<
        | { ok: true; revisedMd: string; changeCount: number;
            changes: Array<{ kind: string; before: string; after: string; note?: string }> }
        | { ok: false; error: 'session_invalid' | 'no_draft' }>`.
      Behaviour:
      1. Load session via `getSession(userId, sessionId)`. If null,
         return `{ ok: false, error: 'session_invalid' }`.
      2. If `session.draftMd` is null/empty, return
         `{ ok: false, error: 'no_draft' }`.
      3. Load `profile` via `getProfile(userId, session.profileId)`.
         If null, return `{ ok: false, error: 'session_invalid' }`.
      4. Build a minimal `ctx` (same pattern as `run-fact-check.ts`:
         `emit` forwards to `emitEvent`, `userInput` rejects, `log`
         is a no-op, `llm` is `{} as never`).
      5. Call `withStageCtx(autoReview, sessionId, userId, () =>
          autoReview.run({ profile, draftMd: session.draftMd! }, ctx))`.
      6. Return `{ ok: true, revisedMd, changeCount: changes.length,
          changes }`.
      Touches: `src/server/pipeline/run-auto-review.ts` (new),
      `tests/unit/pipeline/run-auto-review.test.ts` (new).
      Acceptance:
        - Unit test: mock `getSession` → null; asserts result is
          `{ ok: false, error: 'session_invalid' }` and the stage is
          not called.
        - Unit test: mock `getSession` with `draftMd: null`; asserts
          result is `{ ok: false, error: 'no_draft' }`.
        - Unit test: mock `getProfile` → null; asserts
          `{ ok: false, error: 'session_invalid' }`.
        - Unit test: full success path — mock `getSession` with a
          non-null `draftMd`, mock `getProfile` to return a profile,
          mock `autoReview.run` to return
          `{ revisedMd: 'r', changes: [{ kind: 'humanize', before: 'a', after: 'b' }] }`;
          assert the orchestrator returns
          `{ ok: true, revisedMd: 'r', changeCount: 1, changes: [...] }`.
        - Unit test: asserts `withStageCtx` is called with the
          `autoReview` stage, the session's `sessionId`, and `userId`
          (verify by checking that the mocked `autoReview.run` is
          called inside the stage-ctx wrapper — mock `withStageCtx` to
          call its callback directly).
        - `pnpm typecheck && pnpm test` exit 0.

- [x] T-L6-4: Runner — `review` light-mode branch with snapshot + auto-review
      Goal: Replace the `if (session.mode === 'light') return;` early
      exit in `case 'review':` in
      `src/server/pipeline/runner.ts` with the full light-mode review
      sequence:
      1. **Snapshot guard.** If `session.draftMdPreReview == null`,
         call `await updateSessionDraftPreReview(userId, sessionId,
          session.draftMd!)`. Import `updateSessionDraftPreReview` from
         `../sessions/repo`. If `session.draftMdPreReview` is already
         set, skip — this preserves the first pre-review snapshot on
         re-runs.
      2. **Auto-review.** Call `await runAutoReview({ sessionId,
          userId })`. If the result is `{ ok: false }`, emit
         `agent_message { text: 'Auto-review failed: <error>', error: true }`
         and `return` (do not advance state).
      3. **Persist revised draft.** Call `await updateSessionDraft(
          userId, sessionId, result.revisedMd)`.
      4. **Emit change summary.** Emit `artifact_updated { kind:
          'auto_review_applied', changeCount: result.changeCount,
          changes: result.changes }`.
      5. **Advance to `done`** temporarily: call
         `await updateSessionState(userId, sessionId, 'done')` and
         emit `state_changed { state: 'done' }`. (L-7 will insert
         claims extraction between steps 4 and 5; for now `done` is
         reached directly.)
      Import `runAutoReview` from `./run-auto-review` and
      `updateSessionDraftPreReview` from `../sessions/repo`.
      The full-mode `case 'review':` body is unchanged.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-review.test.ts` (extend with
      light-mode cases).
      Acceptance:
        - Unit test: `session.mode = 'light'`, `draftMdPreReview: null`,
          `draftMd: 'original'`. Mock `runAutoReview` to return
          `{ ok: true, revisedMd: 'revised', changeCount: 1,
           changes: [] }`. Assert:
          (a) `updateSessionDraftPreReview` is called with `'original'`;
          (b) `updateSessionDraft` is called with `'revised'`;
          (c) an `artifact_updated` event with
              `kind: 'auto_review_applied'` and `changeCount: 1` is
              emitted;
          (d) `updateSessionState(..., 'done')` is called;
          (e) a `state_changed { state: 'done' }` event is emitted.
        - Unit test: `session.mode = 'light'`,
          `draftMdPreReview: 'already_set'`. Assert
          `updateSessionDraftPreReview` is NOT called (snapshot guard).
        - Unit test: `session.mode = 'light'`, `runAutoReview` returns
          `{ ok: false, error: 'no_draft' }`. Assert: an
          `agent_message` with `error: true` is emitted;
          `updateSessionState` is NOT called; the runner returns
          without throwing.
        - Existing full-mode review tests (T-L5 from
          `runner-review.test.ts`) still pass without modification.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: import `updateSessionDraftPreReview` alongside the
      existing session repo imports at the top of `runner.ts`. The
      `runAutoReview` import goes with the other orchestrator imports.
      Do not add `draft-full`, `draftFull`, or any other new import
      not needed by this case.

- [x] T-L6-5: Revert action + UI wiring for "Revert to pre-review" button
      Goal: Two changes:
      1. **Server action.** Add `revertToPreReviewAction(sessionId:
          number): Promise<{ ok: boolean; error?: string }>` in
         `src/app/(app)/sessions/[id]/actions.ts`. It:
         - `requireUser()`;
         - loads the session via `getSession(user.id, sessionId)`; if
           null return `{ ok: false, error: 'not_found' }`;
         - if `session.draftMdPreReview == null` return
           `{ ok: false, error: 'no_snapshot' }`;
         - calls `updateSessionDraft(user.id, sessionId,
            session.draftMdPreReview)` to restore the original text;
         - calls `revalidatePath('/sessions/[id]', 'page')` with the
           session id literal so the page re-fetches the restored
           draft;
         - returns `{ ok: true }`.
      2. **UI wiring.** In
         `src/app/(app)/sessions/[id]/light-result-pane.tsx`, add an
         `onClick` handler to the existing "Revert to pre-review"
         button that calls `revertToPreReviewAction(sessionId)` and
         — on success — calls `router.refresh()` from
         `useRouter()` (`next/navigation`). `revalidatePath` in the
         action busts the RSC cache; `router.refresh()` triggers the
         re-fetch from the client without a full page reload, so the
         server component re-renders with the restored `draftMd` and
         `previewHtml`. While the action is in-flight, disable the
         button and change the label to "Reverting…".
      Touches: `src/app/(app)/sessions/[id]/actions.ts` (extend),
      `src/app/(app)/sessions/[id]/light-result-pane.tsx` (extend),
      `tests/unit/sessions/revert-pre-review-action.test.ts` (new).
      Acceptance:
        - Unit test: `revertToPreReviewAction` with mocked
          `getSession` returning null → `{ ok: false, error: 'not_found' }`;
          `updateSessionDraft` is not called.
        - Unit test: `getSession` returns a session with
          `draftMdPreReview: null` → `{ ok: false, error: 'no_snapshot' }`;
          `updateSessionDraft` is not called.
        - Unit test: `getSession` returns a session with
          `draftMdPreReview: 'original text'` → `updateSessionDraft`
          is called with `'original text'` and the result is
          `{ ok: true }`.
        - Component test (extending
          `tests/unit/sessions/light-result-pane.test.ts`):
          `renderToString` with `draftMdPreReview: 'snap'` asserts the
          revert button does NOT have the `disabled` attribute (already
          covered by existing test from T-L5-3; re-confirm it still
          passes after this task's change).
        - Manual via `pnpm dev`: on a light session that has completed
          auto-review, the "Revert to pre-review" button is enabled;
          clicking it restores the pre-review markdown visibly in the
          preview iframe after `router.refresh()` resolves.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: `revalidatePath` + `router.refresh()` is the canonical
      Next pair — server invalidates the cache, client triggers the
      RSC re-fetch. No `window.location.reload()` (full reload would
      be a heavier dupe of the same effect). Intentionally simple —
      no optimistic state management, no SSE needed.

---

## Epic L-7 — Claims extraction + on-demand per-claim verification

**Status: planned**

**Goal:** After auto-review, the runner automatically extracts factual
claims from the revised article using the **existing** `extract-claims`
stage and persists them into the **existing** `claims` table. The
result UI shows the claim list with a "verify" button per claim; a
press triggers the existing `verify-claim` + `adjudicate-claim` stages
on that single claim. The user is free to ignore the list entirely;
nothing blocks the session from being exported.

**Reuse posture:** this epic introduces **no new stages** and **no new
claim/verdict storage**. It adds (a) one new orchestrator entry-point
for single-claim verification, (b) one server action, (c) UI surface,
and (d) wiring inside the light-mode `review` runner branch.

**Intent:**

*Storage:* the existing relational claims subsystem is reused as-is —
`claims (round_id NOT NULL → critique_rounds.id, ...)`,
`claim_verdicts`, `claim_evidence`. To satisfy the FK without making
`round_id` nullable, the light runner creates **one synthetic
`critique_round`** per session with
`{ kind: 'auto_review', draft_hash: sha256(revisedMd) }` and uses its
`id` as `round_id` for all extracted claims. Re-runs of `review`
(triggered by user "regenerate") produce a new round on a different
`draft_hash` — same idempotency guarantees as full mode.

*Stage reuse — `extract-claims`.* The existing stage signature is
`{ plan, sectionDrafts: Array<{ sectionId, contentMd }> }` →
`ClaimsResponse` (smart model). For light mode we feed it a
single-section synthetic `sectionDrafts`:
`[{ sectionId: 'full', contentMd: revisedMd }]`. The session's `plan`
already exists from `build-plan`; we either inject a section with
`id='full'` into a copy of the plan for this call, or pre-pend the
plan's first section id — implementer choice, default: synthetic
`'full'` section appended to a *copy* of the plan passed to the stage,
not persisted. Resulting claim spans use `section_id='full'`; the UI
treats this case as "no section anchor, scroll to top".

*Runner sequence in `review` state, appended after L-6:*
1. (L-6 steps 1–4 as defined.)
2. `INSERT INTO critique_rounds (session_id, kind, draft_hash)
    VALUES (?, 'auto_review', sha256(revisedMd)) RETURNING id`.
3. Call `extract-claims` (wrapped in `withStageCtx`) over the
   single-section synthetic input.
4. `INSERT` extracted claims into `claims` with that `round_id`,
   `status='open'`, `span_hash = sha256(span_text)`.
5. Emit `artifact_updated { kind: 'claims_extracted', count, roundId }`.
6. Advance state to `done`.

*On-demand verification — new orchestrator `run-fact-check.ts`
extension or sibling `run-fact-check-claim.ts`:* exports
`verifyClaim(sessionId, claimId, userId)`. Internally:
- Loads the claim row + session sources.
- Calls existing `verify-claim` stage (search) with the claim and
  accepted sources to produce evidence (wrapped in `withStageCtx`).
- Calls existing `adjudicate-claim` stage (smart) with claim +
  evidence to produce a verdict (wrapped in `withStageCtx`).
- Persists `claim_verdicts` row + `claim_evidence` rows.
- Sets `claims.status = 'verified' | 'contradicted' | 'unverifiable' |
   'needs_caveat'` (matches the verdict enum).
- Emits `artifact_updated { kind: 'claim_verified', claimId, verdict }`.

This is exactly what existing `run-fact-check.ts` does in batch — we
extract the per-claim path so it can be invoked one claim at a time.
**Decision needed:** extend the existing orchestrator with an optional
`claimIds?: number[]` filter vs. add a sibling file. Default: extend
existing — less duplication, single test surface.

*Server action `verifyClaimAction(sessionId, claimId)`:* thin wrapper
in the sessions actions file; auth-checks ownership, dispatches the
orchestrator, returns void (UI listens to SSE for the verdict event).
Bulk variant `verifyAllClaimsAction(sessionId)` iterates with
concurrency 3, respecting the existing USD budget enforcement (calls
will throw `BudgetExceededError` if cap hit — surface as a toast).

*UI in `LightResultPane`:* a "Claims to verify" panel listing each
claim with type-icon, claim text, status badge ("Pending verify",
"Verified ✓", "Contradicted ✗", "Unverifiable", "Needs caveat"), and a
"Verify" button (disabled while in flight). On verdict, expand to show
the `justification` text and the `claim_evidence` URLs. Verdict pill
styling matches the existing full-mode `<ClaimCard>` colour scheme so
the two views stay consistent.

This epic depends on L-5 (UI shell) and L-6 (auto-review must run
first so claims are extracted from the final text, not the pre-review
draft).

### Tasks

- [x] T-L7-1: Widen `critique-repo` round-kind union to include `'auto_review'`
      Goal: Update `createCritiqueRound`'s `kind` parameter type from
      `'critique' | 'factcheck'` to
      `'critique' | 'factcheck' | 'auto_review'` in
      `src/server/sessions/critique-repo.ts`. Update `listSessionRounds`'s
      optional `kind` filter parameter to the same union. No DB schema
      change is needed — `kind` is a `text` column already.
      Touches: `src/server/sessions/critique-repo.ts`,
      `tests/unit/sessions/critique-repo.test.ts` (extend if exists, else new).
      Acceptance:
        - Unit test: `createCritiqueRound(userId, sessionId, 'auto_review',
           'h')` (with mocked DB) inserts a row whose `kind` value is
          `'auto_review'`.
        - Unit test: `listSessionRounds(userId, sessionId, 'auto_review')`
          (with mocked DB) issues a query whose `where` clause filters
          on `kind = 'auto_review'`.
        - `pnpm typecheck` accepts a call site
          `createCritiqueRound(uid, sid, 'auto_review', 'h')` where it
          would have previously rejected the third argument.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: This is the only union widening L-7 needs; existing
      `'critique'` / `'factcheck'` callers stay type-compatible. No
      changes to `bulkSetFindingStatus` / `setFindingStatus` —
      auto-review creates no findings.

- [x] T-L7-2: `runLightClaimsExtraction` orchestrator
      Goal: New module
      `src/server/pipeline/run-light-claims-extraction.ts` exporting
      `runLightClaimsExtraction({ sessionId, userId, revisedMd }):
        Promise<
          | { ok: true; roundId: number; count: number }
          | { ok: false; error: 'session_invalid' | 'no_plan' }>`.
      Behaviour:
      1. Load session via `getSession(userId, sessionId)`. If null,
         return `{ ok: false, error: 'session_invalid' }`.
      2. Parse `session.plan` with `planSchema`. If invalid, return
         `{ ok: false, error: 'no_plan' }`.
      3. Build a synthetic plan in memory (not persisted):
         `{ ...plan, sections: [...plan.sections, { id: 'full',
          title: 'Full article', intent: '', expectedLength:
          revisedMd.length, keyPoints: [] }] }`.
      4. Create the synthetic round:
         `await createCritiqueRound(userId, sessionId, 'auto_review',
          spanHash(revisedMd))`. If null, return
         `{ ok: false, error: 'session_invalid' }`.
      5. Build the same minimal `ctx` as `run-fact-check.ts` (emit
         forwards to `emitEvent`, `userInput` rejects, `log` no-op,
         `llm` cast to `never`).
      6. Call `await withStageCtx(extractClaims, sessionId, userId,
          () => extractClaims.run({ plan: syntheticPlan, sectionDrafts:
          [{ sectionId: 'full', contentMd: revisedMd }] }, ctx))`.
      7. For each claim returned, call `await insertClaim(userId,
          sessionId, round.id, { span: claim.span, spanHash:
          spanHash(claim.span.text), claimText: claim.span.text,
          claimType: claim.claimType, checkWorthiness:
          claim.checkWorthiness })`.
      8. Emit `await emitEvent(sessionId, 'artifact_updated', { kind:
          'claims_extracted', count, roundId: round.id })`.
      9. Return `{ ok: true, roundId: round.id, count }`.
      Touches: `src/server/pipeline/run-light-claims-extraction.ts`
      (new), `tests/unit/pipeline/run-light-claims-extraction.test.ts`
      (new).
      Acceptance:
        - Unit test: mock `getSession` → null; result is
          `{ ok: false, error: 'session_invalid' }` and
          `extractClaims.run` is not called.
        - Unit test: `getSession` returning a session whose `plan`
          fails `planSchema.safeParse` yields
          `{ ok: false, error: 'no_plan' }`.
        - Unit test: full success path — mock `getSession`,
          `createCritiqueRound` → `{ id: 99, ... }`, `extractClaims.run`
          → `{ claims: [{ span: { sectionId: 'full', charStart: 0,
          charEnd: 5, text: 'hello' }, claimType: 'other',
          checkWorthiness: 'low' }] }`, `insertClaim` → row.
          Assert: `insertClaim` called once with `roundId: 99` and
          `spanHash` derived from `'hello'`; an `artifact_updated`
          event with `kind: 'claims_extracted', count: 1, roundId: 99`
          is emitted; result is `{ ok: true, roundId: 99, count: 1 }`.
        - Unit test: asserts `withStageCtx` is called with the
          `extractClaims` stage, `sessionId`, and `userId` (mock
          `withStageCtx` to invoke its callback directly).
        - Unit test: asserts the `sectionDrafts` argument passed to
          `extractClaims.run` is exactly
          `[{ sectionId: 'full', contentMd: revisedMd }]`.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: `revisedMd` is passed in by the runner (already in memory
      after auto-review) to avoid an extra DB round-trip. Per-claim
      `span_hash` indexing on `claims_session_id_span_hash_idx` will
      let later verification skip duplicates without an extra dedup
      step here, mirroring full-mode `run-fact-check.ts`.

- [x] T-L7-3: Runner — invoke claims extraction inside light review branch
      Goal: In `src/server/pipeline/runner.ts`'s `case 'review':`
      branch, between the existing `artifact_updated { kind:
      'auto_review_applied' }` emit (around lines 433–437) and the
      existing `state_changed → done` transition (lines 439–440),
      insert a call to `runLightClaimsExtraction`. Sequence:
      1. After `updateSessionDraft(...)` and the `auto_review_applied`
         emit, call
         `const claimsResult = await runLightClaimsExtraction({
           sessionId, userId, revisedMd: autoReviewResult.revisedMd });`.
      2. If `claimsResult.ok === false`, emit
         `agent_message { text: 'Claim extraction failed: <error>',
          error: true }` — but **do NOT return**; continue to the
         `state_changed → done` step. Claims are best-effort.
      3. The existing `updateSessionState(..., 'done')` +
         `state_changed { state: 'done' }` block runs unchanged.
      Import `runLightClaimsExtraction` alongside `runAutoReview` at
      the top of `runner.ts`.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-review.test.ts` (extend).
      Acceptance:
        - Unit test: `session.mode = 'light'`. Mock `runAutoReview` →
          `{ ok: true, revisedMd: 'r', changeCount: 1, changes: [] }`,
          `runLightClaimsExtraction` →
          `{ ok: true, roundId: 7, count: 3 }`. Assert (in order):
          `runLightClaimsExtraction` is called with `revisedMd: 'r'`;
          the `state_changed { state: 'done' }` event is emitted
          *after* `runLightClaimsExtraction` resolved (record event +
          call order in the mock collector); `updateSessionState(...,
           'done')` is called.
        - Unit test: `runLightClaimsExtraction` →
          `{ ok: false, error: 'no_plan' }`. Assert: an `agent_message`
          event with `error: true` is emitted; `updateSessionState(...,
           'done')` is STILL called; `state_changed { state: 'done' }`
          is STILL emitted.
        - Unit test: T-L6-4 light-mode review cases (auto-review
          success, snapshot guard, auto-review failure) still pass
          unmodified.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: extraction failure is non-fatal — the user can still
      export the article. The `'no_draft'` path is unreachable here
      because L-6's auto-review step already enforced the precondition.

- [ ] T-L7-4: `verifyExistingClaim` orchestrator (single-claim path)
      Goal: Add a new exported function in
      `src/server/pipeline/run-fact-check.ts`:
      `verifyExistingClaim({ sessionId, userId, claimId, force = false }):
        Promise<
          | { ok: true; verdict: Verdict }
          | { ok: false; error: 'claim_not_found' | 'session_invalid'
              | 'already_verified' }>`.
      Behaviour:
      1. Call `getClaimWithLatestVerdict(userId, claimId)`. If null,
         return `{ ok: false, error: 'claim_not_found' }`.
      2. If `row.claim.sessionId !== sessionId`, return
         `{ ok: false, error: 'claim_not_found' }`.
      3. If `row.verdict != null && !force`, return
         `{ ok: false, error: 'already_verified' }`.
      4. `getSession(userId, sessionId)` for source lookup. If null,
         `{ ok: false, error: 'session_invalid' }`.
      5. `const acceptedSources = (await listSessionSources(userId,
          sessionId)).filter(s => s.status === 'accepted')`.
      6. Build the standard `ctx` (same shape as `runFactCheck`).
      7. Reconstruct a `Claim` object from the stored row:
         `{ span: row.claim.span as ClaimSpan, claimType:
          row.claim.claimType as ClaimType, checkWorthiness:
          row.claim.checkWorthiness as CheckWorthiness }`.
      8. `const { evidence } = await withStageCtx(verifyClaim,
          sessionId, userId, () => verifyClaim.run({ claim,
          acceptedSources }, ctx))`.
      9. `const adjudication = await withStageCtx(adjudicateClaim,
          sessionId, userId, () => adjudicateClaim.run({ claim,
          evidence }, ctx))`.
      10. `const verdictRow = await insertClaimVerdict(userId,
           claimId, { verdict: adjudication.verdict, justification:
           adjudication.justification })`. If null,
          `{ ok: false, error: 'session_invalid' }`.
      11. `await insertClaimEvidence(userId, verdictRow.id, evidence)`.
      12. `await emitEvent(sessionId, 'artifact_updated', { kind:
           'claim_verdict', claimId, verdict: adjudication.verdict })`.
      13. Return `{ ok: true, verdict: adjudication.verdict }`.
      Touches: `src/server/pipeline/run-fact-check.ts` (extend),
      `tests/unit/pipeline/verify-existing-claim.test.ts` (new).
      Acceptance:
        - Unit test: `getClaimWithLatestVerdict` → null; result is
          `{ ok: false, error: 'claim_not_found' }`; no stages called.
        - Unit test: `getClaimWithLatestVerdict` returns a claim whose
          `sessionId` differs from the argument → `{ ok: false, error:
          'claim_not_found' }`.
        - Unit test: existing verdict + `force` falsey →
          `{ ok: false, error: 'already_verified' }`; no stages called.
        - Unit test: `force: true` with an existing verdict — re-runs
          and returns `{ ok: true, verdict: ... }`.
        - Unit test: full success — mock all repos and stages; assert
          `insertClaimVerdict` and `insertClaimEvidence` called once
          each, an `artifact_updated { kind: 'claim_verdict' }` event
          is emitted with the adjudicated verdict, and the result
          carries that verdict string.
        - Unit test: asserts both `verifyClaim` and `adjudicateClaim`
          are wrapped via `withStageCtx` (mock `withStageCtx` to
          invoke its callback and assert call count == 2 with the
          expected stage references).
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: existing `runFactCheck` is left intact — this is a
      sibling export reusing the same `ctx`-building pattern.
      Decision needed: claim-status mutation on verdict in light mode.
      Default (chosen): leave `claims.status = 'open'`; the verdict
      pill on the row carries the outcome. Do NOT call
      `setClaimStatus`. Extracting a shared
      `runVerifyAdjudicateForClaim` helper between this function and
      `runFactCheck` is **not** in scope; revisit only if duplication
      exceeds ~30 lines after this task lands.

- [ ] T-L7-5: Server actions `verifyClaimAction` and `verifyAllClaimsAction`
      Goal: In `src/app/(app)/sessions/[id]/actions.ts`:
      1. Add
         `export async function verifyClaimAction(sessionId: number,
           claimId: number, force?: boolean):
           Promise<{ ok: true; verdict: string }
                  | { ok: false; error: string }>`.
         Implementation: `requireUser()`; call `verifyExistingClaim({
          sessionId, userId: user.id, claimId, force: !!force })`;
         on `ok` `revalidatePath('/sessions/' + sessionId)`; return
         result.
      2. Add
         `export async function verifyAllClaimsAction(sessionId: number):
           Promise<{ ok: true; verifiedCount: number; failedCount:
                     number; budgetExceeded: boolean }>`.
         Implementation: `requireUser()`;
         `listSessionClaimsWithVerdicts(user.id, sessionId)`; filter
         to claims with `verdict == null` AND `claim.checkWorthiness !==
          'low'` AND `claim.status === 'open'`; iterate with
         concurrency 3 (write a small inline `mapWithConcurrency<T,U>(
          items, n, fn)` helper — do NOT add a dependency); for each
         eligible claim call `verifyExistingClaim`; catch
         `BudgetExceededError` (import from
         `../../../../server/llm/budget-guard`) — set
         `budgetExceeded = true` and stop scheduling further tasks
         (drain any in-flight). Increment `verifiedCount` on success
         result, `failedCount` on `{ ok: false }`. `revalidatePath`
         once at end. Return aggregate counts.
      Touches: `src/app/(app)/sessions/[id]/actions.ts` (extend),
      `tests/unit/sessions/verify-claim-actions.test.ts` (new).
      Acceptance:
        - Unit test: `verifyClaimAction` calls `verifyExistingClaim`
          with `requireUser()`'s id and the supplied `sessionId`,
          `claimId`, `force`. On `ok`, `revalidatePath` is called.
        - Unit test: `verifyAllClaimsAction` skips claims that already
          have a verdict, and claims with `checkWorthiness === 'low'`,
          and claims with `status !== 'open'` (verify by mocking
          `listSessionClaimsWithVerdicts` with a mixed set and
          asserting `verifyExistingClaim` call count equals only the
          eligible subset).
        - Unit test: `verifyAllClaimsAction` — when one in-flight
          `verifyExistingClaim` throws `BudgetExceededError`, the
          returned object has `budgetExceeded: true`, no further
          `verifyExistingClaim` calls are scheduled past the failure,
          and any in-flight calls are awaited (use a deferred-promise
          scaffold).
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: concurrency 3 is fixed — do NOT make it configurable in
      v1. `BudgetExceededError` short-circuits scheduling but does NOT
      throw out of the action; UI surfaces it via the `budgetExceeded`
      flag. Decision needed: action returns counts vs. detailed
      per-claim results. Default (chosen): aggregate counts only;
      verdicts stream via SSE (`artifact_updated { kind:
      'claim_verdict' }`), so the UI doesn't need them in the
      response.

- [ ] T-L7-6: Page wiring — load claims for light-mode `done` state
      Goal: In `src/app/(app)/sessions/[id]/page.tsx`, inside the
      `if (session.mode === 'light')` branch (around lines 45–77),
      when `session.state === 'done'`, also call
      `listSessionClaimsWithVerdicts(user.id, id)` and pass the
      result down. Then thread a new prop through:
      - `LightSessionPane` accepts `claimsWithVerdicts:
        ClaimWithVerdict[]` (default `[]`).
      - `LightResultPane` accepts `claimsWithVerdicts:
        ClaimWithVerdict[]` (default `[]`).
      Reuse the `ClaimWithVerdict` type already defined in
      `factcheck-tab.tsx`; add an `export` keyword to its declaration
      if it isn't already exported, and import it from
      `./factcheck-tab`. Do NOT query for non-`done` light states;
      pass `[]`.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`,
      `src/app/(app)/sessions/[id]/light-session-pane.tsx`,
      `src/app/(app)/sessions/[id]/light-result-pane.tsx`,
      `src/app/(app)/sessions/[id]/factcheck-tab.tsx` (only to add
      the `export` keyword if missing; no other change).
      Acceptance:
        - `pnpm typecheck` accepts the new prop on both panes.
        - Existing tests for `LightResultPane` / `LightSessionPane`
          still pass (default `[]` keeps backward compatibility).
        - Manual via `pnpm dev`: open a light session in `done` state
          that has extracted claims; the page renders without runtime
          error and `claimsWithVerdicts` is in scope on
          `LightResultPane` (visual rendering lands in T-L7-8).
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.

- [ ] T-L7-7: `LightClaimCard` presentational component
      Goal: New component
      `src/app/(app)/sessions/[id]/light-claim-card.tsx` that renders
      one claim row for the light-mode result panel.
      Props:
      `{ claim: ClaimRow; verdict: VerdictRow | null; verifying:
        boolean; onVerify: () => void }`.
      Layout (no accept/dismiss/opinion buttons — light mode only
      offers "Verify"):
      - Row 1: `claimType` + `checkWorthiness` badges (small gray
        pills mirroring `<ClaimCard>`'s style).
      - Row 2: claim text (`font-medium text-gray-800`).
      - Row 3 when `verdict == null`: a "Pending verify" gray pill +
        a right-aligned "Verify" button. Disabled while `verifying`
        is true; label flips to "Verifying…".
      - Row 3 when `verdict != null`: a verdict pill colored via
        `verdictColors` (inline-duplicated from `claim-card.tsx`)
        followed by `verdict.justification` text.
      Touches: `src/app/(app)/sessions/[id]/light-claim-card.tsx`
      (new), `tests/unit/sessions/light-claim-card.test.tsx` (new).
      Acceptance:
        - Component test (`renderToString`): with `verdict: null`,
          output contains "Pending verify" and a button labelled
          "Verify".
        - Component test: `verdict: null` + `verifying: true` → the
          button has `disabled` and label "Verifying…".
        - Component test: `verdict: { verdict: 'verified',
          justification: 'OK' }` → output contains the verified-pill
          class `bg-green-100`; no "Verify" button rendered.
        - Component test: `verdict: { verdict: 'contradicted',
          justification: 'No' }` → output contains `bg-red-100`.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: The `verdictColors` map is duplicated inline; do NOT
      refactor it into a shared module yet (only two call sites).
      Evidence rendering belongs to T-L7-8 / a follow-up — this card
      never receives evidence rows.

- [ ] T-L7-8: Wire claims panel into `LightResultPane`
      Goal: Replace the placeholder
      `<div data-slot="claims-panel">` block in
      `src/app/(app)/sessions/[id]/light-result-pane.tsx` with a real
      panel:
      1. Receive `claimsWithVerdicts` prop (added in T-L7-6) and seed
         a local `useState` map keyed by claim id:
         `Map<number, { claim: ClaimRow; verdict: VerdictRow | null }>`.
      2. Subscribe via `useSessionEvents(sessionId)` and react to
         `artifact_updated` events with
         `payload.kind === 'claim_verdict'`: when received, call a
         new server action `getClaimVerdictAction(sessionId, claimId)`
         (add to `actions.ts` — thin wrapper over
         `getClaimWithLatestVerdict` that returns the latest verdict
         row and `[]` for evidence; full evidence rendering is
         out-of-scope) and merge into local state.
      3. Render header "Claims to verify" + a "Verify all" button
         (calls `verifyAllClaimsAction(sessionId)`; disabled while in
         flight). Below: a flex-col list of `<LightClaimCard>` per
         claim, sorted by claim id ascending. The card's `onVerify`
         calls `verifyClaimAction(sessionId, claim.id)` and toggles a
         per-claim `verifying` flag in local state until the SSE
         verdict event resolves it.
      4. When `claimsWithVerdicts` is empty render the existing
         placeholder text ("Claims will appear here once extracted.").
         When the prop is non-empty but every claim has
         `checkWorthiness === 'low'` and no verdict, the "Verify all"
         button still renders but is disabled with title "No
         verifiable claims found." (mirrors the no-eligible-claims
         filter from T-L7-5).
      5. If `verifyAllClaimsAction` resolves with
         `budgetExceeded: true`, render a single inline red `<p>`
         under the button: "Budget cap reached — verification
         stopped." No toast library.
      Touches: `src/app/(app)/sessions/[id]/light-result-pane.tsx`
      (extend), `src/app/(app)/sessions/[id]/actions.ts` (add
      `getClaimVerdictAction`),
      `tests/unit/sessions/light-result-pane.test.ts` (extend).
      Acceptance:
        - Component test (`renderToString`) with two claims (one with
          a verdict, one without): output contains both claim texts,
          a verdict pill for the first, and a "Verify" button for the
          second.
        - Component test: `claimsWithVerdicts: []` renders the
          existing placeholder ("Claims will appear here…").
        - Unit test: `getClaimVerdictAction` returns
          `{ ok: true, verdict, evidence: [] }` on success and
          `{ ok: false, error: 'not_found' }` when the claim is not
          owned by the user.
        - Manual via `pnpm dev`: complete a light session through
          auto-review; observe the claims list rendered with "Pending
          verify" pills; click "Verify" on one row; within a few
          seconds the pill flips to the verdict color via the SSE
          `claim_verdict` event.
        - `pnpm lint && pnpm typecheck && pnpm test` exit 0.
      Notes: `getClaimVerdictAction` returns
      `{ verdict, evidence: [] }` until evidence rendering is added
      in a future epic — the action shape is forward-compatible.
      Decision needed: SSE-only refresh vs. `router.refresh()`.
      Default (chosen): SSE event triggers a small action that
      fetches just the changed claim's verdict, avoiding a full RSC
      re-render on every verdict.

<!-- PLANING_CHECKPOINT -->

---

## Epic L-8 — Hero image for light mode

**Status: TBD**

**Goal:** After claims extraction completes, the light mode pipeline
generates exactly one hero image and attaches it to the session
without any user selection UI.

**Intent:** A new orchestrator `pipeline/run-light-hero-image.ts`
runs *after* the runner has already advanced the session to `done` —
fired from the same code path that emits the `state_changed → done`
event for light sessions. It uses the existing image stages
(`compose-image-prompt`, `prerender-images`), wrapped in
`withStageCtx`, requesting exactly 1 candidate. Result is persisted to
`sessions.images` as `{ hero: { url, prompt, localPath } }` (matching
the existing image shape). Emits
`artifact_updated { kind: 'hero_image', url }`. The UI placeholder
slot in `LightResultPane` swaps in via SSE. Failures (budget cap, API
error) are logged + emitted as
`artifact_updated { kind: 'hero_image_failed', reason }` and leave the
placeholder in place — they do **not** prevent the user from
exporting, since the article itself is already finalized.

---

## Epic L-9 — Batch session creation with rate limiting

**Status: TBD**

**Goal:** A user can submit a list of topics (one per line, up to 50)
and the system creates one light-mode session per topic. Sessions run
under the per-user concurrency cap (`BATCH_CONCURRENCY = 6`) and daily
budget caps from "Quality guardrails". A batch list page shows live
progress per session.

**Intent:**

*Schema:* `batches` (`id`, `user_id`, `profile_id`, `created_at`) and
`batch_sessions` join (`batch_id`, `session_id`).

*Server action `createBatchAction`:* parses topics, checks **both**
the existing USD caps (`monthly_cap_usd`, `session_cap_usd` via the
same accessor `assertBudget` uses internally — but as a pre-flight
read, not as a guard wrapped around an LLM call) and the new
count-based caps (`BATCH_DAILY_SESSION_CAP`,
`BATCH_DAILY_IMAGE_CAP`). Reject with an explicit per-cap error
message if breached. On success, creates N sessions via
`createSession` (all `mode = 'light'`). Sessions enter a new `queued`
substate of `briefing` rather than starting immediately.

*Queue runner:* a per-user dispatcher polls / reacts to session
completion events and starts the next queued session whenever the
running count is below `BATCH_CONCURRENCY`. Implementation can be a
simple in-process worker keyed by `user_id` (no external queue
infrastructure required for v1).

*Batch list page (`/sessions/batch/[batchId]`):* renders a card per
session showing topic, current state (including `queued`), and a link
to the full session page. State streams via SSE for member sessions,
multiplexed into a single batch endpoint (or polled — planner choice).
Each completed card shows a 200-char preview of `draft_md`.

*Caps enforcement:* `BATCH_DAILY_SESSION_CAP` and
`BATCH_DAILY_IMAGE_CAP` are checked at batch creation time *and* before
each session starts, so a long-running batch that crosses midnight
keeps respecting the new day's cap. Mid-batch USD-cap exhaustion
manifests as `BudgetExceededError` from the LLM router (existing
behaviour); the dispatcher catches it, marks the session
`state='failed'` with a reason, emits an `artifact_updated` event on
the batch endpoint, and continues with the next queued session rather
than tearing down the whole batch.

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
| Review | Interactive critics + fact-check | Auto-review (humanity + coherence) over a **snapshot** of the pre-review draft |
| Claims & fact-check | Mandatory critic-driven | Auto-extracted claims list shown to user; fact-check is **opt-in per claim** |
| Image | Candidate selection UI | 1 hero image, auto-attached |
| Export | Same | Same |

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
  revision, the runner copies current `draft_md` into a new column
  `sessions.draft_md_pre_review text NULL`. The result UI exposes a
  "revert to pre-review" action and the fact-check epic uses the
  snapshot to cross-reference claims against the original wording.
- **Batch concurrency & budget.** No more than `BATCH_CONCURRENCY = 6`
  light sessions run their LLM-bound stages concurrently per user;
  surplus sessions sit in a `queued` substate. Per-user daily caps
  `BATCH_DAILY_SESSION_CAP = 100` and `BATCH_DAILY_IMAGE_CAP = 100`
  (env-overridable). Cap breach → batch creation is rejected with a
  clear error.

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

<!-- PLANING_CHECKPOINT -->

## Epic L-1 — Profile assertions: DB foundation + repo + settings UI

**Status: TBD**

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

---

## Epic L-2 — "Add examples" style analyzer

**Status: TBD**

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

---

## Epic L-3 — Assertion-aware clarification + hidden answer classifier

**Status: TBD**

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
1. For each `new` item, computes embedding similarity against existing
   keys; if `cosine ≥ 0.85` for any existing key, demote it to an
   `agree` against that key (calling `mergeDuplicateKey`).
2. Applies `agree` / `contradict` / `new` via the L-1 repo helpers.

**Tests:** Unit tests for `classify-answers` use a fake `ctx.llm` and
assert the output shape. Integration tests verify the upsert / merge /
contradict paths against the test DB. A test also covers the skip-
threshold logic: an assertion at confidence 0.9 / evidence 3 must
suppress a matching question; at 0.9 / evidence 2 it must not.

---

## Epic L-4 — Light mode session: profile setting, runner, draft-full

**Status: TBD**

**Goal:** A user can create a `mode = 'light'` session, answer a short
clarification (enriched by L-3), and watch the pipeline run fully
automatically up to the `review` state — angle auto-picked via
`recommendedIndex`, plan auto-locked, research limited to 0–2 sources,
full article drafted in a single LLM call with a length cap. The UI is
built in L-5; this epic is testable via API + SSE only.

**Intent:**

*Profile settings (single migration):* add the columns
- `lightResearchSources integer NOT NULL DEFAULT 1` (allowed values 0/1/2)
- `lightMaxWords integer NOT NULL DEFAULT 800` (range 200–2500)
- `sessions.draft_md_pre_review text NULL` (used by L-6, declared here
  to keep migrations grouped)

Expose both light-mode profile settings in the profile edit form.

*`propose-angles` extension:* output schema gains
`recommendedIndex: number` and `recommendationReason: string`. Full mode
uses these only for highlighting; light mode auto-selects.

*Session creation API/server action:* add a `mode` parameter
(`standard` / `light`) to the create-session path. Light sessions
accept a simplified brief: a single `topic` field. The brief stored in
the DB is `{ topic }`.

*Runner:* add a `'light'` branch covering `planning`, `research`, and
`drafting` states:

1. `planning` — run `clarify-brief` (assertion-aware), present questions
   to user, collect answers, run `classify-answers` silently, then run
   `propose-angles`, auto-select `angles[recommendedIndex]`, run
   `build-plan`, immediately call `updateSessionPlan` + advance state.
   No `userInput` gates.
2. `research` — if `lightResearchSources === 0`, skip entirely; else
   issue a single web search with a query derived directly from the
   session topic (no hypothesis planning, no `formulateQueries`), keep
   the top `lightResearchSources` hits by relevance, summarize each.
3. `drafting` — call `draft-full` once; persist `draft_md`; advance to
   `review`.

*`draft-full` stage:* new `Stage<DraftFullInput, DraftFullOutput>` with
`modelClass: 'smart'`. Input: `{ profile, brief, plan, sources, lightMaxWords }`.
Output: `{ contentMd: string, wordCount: number }`. Prompt writes the
complete article in one shot, using the plan's section structure as an
outline and any accepted sources for grounding, respecting the profile's
style/tone/audience and the `lightMaxWords` target. A postprocessing
step truncates the markdown to `lightMaxWords × 1.15` words if
exceeded (cut at the nearest paragraph boundary, append a logging
warning to the runner event log — *not* visible to the user).

---

## Epic L-5 — Light mode session page UI

**Status: TBD**

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

---

## Epic L-6 — Light auto-review with pre-review snapshot

**Status: TBD**

**Goal:** When a light session reaches the `review` state the runner
automatically (a) snapshots the current draft into `draft_md_pre_review`,
(b) runs a single lightweight review pass focused on humanity and
logical coherence, (c) overwrites `draft_md` with the revised version,
(d) emits a structured change summary, and (e) advances the session.
The result UI's revert button becomes active.

**Intent:** Implement `auto-review` as
`Stage<AutoReviewInput, AutoReviewOutput>` with `modelClass: 'smart'`.
Input: `{ profile, draftMd }`. The LLM acts as a final editor:
identify passages that read as AI-generated or logically unclear, and
output a revised full draft. Output:
`{ revisedMd: string, changes: Array<{ kind: 'humanize' | 'clarify' | 'cut', before: string, after: string, note?: string }> }`.

`changeCount` (used in events) = `changes.length`. Definition is now
mechanical, not "diff lines".

Runner sequence in `review` state for light mode:
1. Copy `session.draft_md` into `session.draft_md_pre_review` (UPDATE
   column, no separate table).
2. Call `auto-review`.
3. `updateSessionDraft(sessionId, revisedMd)`.
4. Emit `artifact_updated` with
   `{ kind: 'auto_review_applied', changeCount, changes }` for the chat
   pane.
5. Advance state.

No `critiqueRounds` or `critiqueFindings` rows are created — this is a
direct rewrite, not a structured finding flow.

---

## Epic L-7 — Claims extraction + on-demand fact-check

**Status: TBD**

**Goal:** After auto-review, the runner automatically extracts a list
of factual claims from the revised article and presents them in the
result UI alongside the article. Each claim has a "verify" button that
the user can press to trigger a per-claim fact-check (web search +
LLM verdict). The user is free to ignore the list entirely; nothing
blocks the session from being exported.

**Intent:**

*Stage `extract-claims`* (`modelClass: 'fast'`). Input:
`{ draftMd }`. Output:
`{ claims: Array<{ id: string, text: string, location: { sectionIdx?: number, charStart?: number, charEnd?: number }, type: 'fact' | 'stat' | 'quote' | 'date' | 'name' | 'causal' }> }`.
The prompt instructs the model to surface only assertions that *could
be objectively wrong* (numbers, dated events, named entities, quoted
statements, causal claims) — not opinions or definitions.

*Storage:* extend `sessions` table with
`claims jsonb NOT NULL DEFAULT '[]'`. Each entry:
```ts
{
  id, text, location, type,
  status: 'pending' | 'supported' | 'contradicted' | 'unclear',
  verdict?: { confidence: number, note: string,
              sources: Array<{ url, title, excerpt }> },
  checkedAt?: string
}
```

*Runner sequence in `review` state, appended after L-6:*
1. (L-6 steps as defined.)
2. Call `extract-claims` on the revised draft.
3. Persist `claims` with all entries `status: 'pending'`.
4. Emit `artifact_updated { kind: 'claims_extracted', count }`.
5. Advance state to `done`.

*Stage `fact-check-claim`* (`modelClass: 'fast'` with web-search tool).
Input: `{ claim, draftMd, sources }` (where `sources` are the
research stage's already-fetched results, plus a fresh per-claim web
search). Output: `{ status, confidence, sources, note }`.

*User action:* a server action `verifyClaim(sessionId, claimId)` runs
`fact-check-claim`, updates the claim entry in `sessions.claims`,
emits `artifact_updated { kind: 'claim_verified', claimId, status }`.
Optional bulk action `verifyAllClaims(sessionId)` runs them with
concurrency 3 and the same per-user budget caps as L-9.

*UI in `LightResultPane`:* a "Claims to verify" panel listing each
claim with type-icon, claim text, status badge, verify button. After
verification, expand to show verdict note + source links. Cross-out
styling for `contradicted` to draw attention.

This epic depends on L-5 (UI shell) and L-6 (auto-review must run
first so claims are extracted from the final text, not the pre-review
draft).

---

## Epic L-8 — Hero image for light mode

**Status: TBD**

**Goal:** After claims extraction completes, the light mode pipeline
generates exactly one hero image and attaches it to the session
without any user selection UI.

**Intent:** In the light runner, after `extract-claims` persists the
claims list, run the existing `compose-image-prompt` stage and then
`prerender-images` requesting exactly 1 candidate. Persist to
`session.images` as `{ hero: { url, prompt } }`. Emit
`artifact_updated { kind: 'hero_image', url }`. The session has
already advanced to `done` after L-7; the hero image arriving later is
streamed via SSE and the UI placeholder swaps in. The existing image
subsystem stages are reused as-is — only orchestration (quantity = 1,
auto-attach, post-`done` arrival) changes.

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

*Server action `createBatchAction`:* parses topics, checks daily caps
(reject with explicit error if breached), creates N sessions via
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
keeps respecting the new day's cap.

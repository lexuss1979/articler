# Articler — Implementation Plan

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

### Task format

Each task block looks like:

```
- [ ] T-<epic>-<n>: <one-line title>
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

## Epic 0 — Repository bootstrap

**Status: planned**
**Goal:** Empty repo → `docker compose up` produces a running, blank,
authenticated-route-protected Next.js app on port 18080 with a Postgres
on 13036, plus working lint/typecheck/test commands.

### Tasks

- [x] T-0-1: Initialize Next.js + TypeScript skeleton
      Goal: `pnpm create next-app` baseline at repo root with App Router,
      TypeScript, Tailwind, ESLint enabled. `pnpm dev` runs.
      Touches: `package.json`, `next.config.ts`, `tsconfig.json`,
      `src/app/layout.tsx`, `src/app/page.tsx`, `tailwind.config.ts`,
      `postcss.config.mjs`, `.gitignore`, `.eslintrc.*`.
      Acceptance: - `pnpm install && pnpm dev` serves the default page. - `pnpm lint` exits 0. - `pnpm typecheck` (script wraps `tsc --noEmit`) exits 0.

- [x] T-0-2: Add Vitest + first smoke test
      Goal: `pnpm test` runs.
      Touches: `vitest.config.ts`, `tests/unit/smoke.test.ts`,
      `package.json` (script).
      Acceptance: - `pnpm test` runs and the smoke test passes.

- [x] T-0-3: Add Prettier
      Goal: `pnpm format` formats; `pnpm format:check` is in CI script.
      Touches: `.prettierrc`, `.prettierignore`, `package.json`.
      Acceptance: - `pnpm format:check` exits 0 on a fresh clone.

- [x] T-0-4: Dockerize the app
      Goal: A multi-stage Dockerfile builds a production image; image
      runs and serves on container port 3000.
      Touches: `Dockerfile`, `.dockerignore`.
      Acceptance: - `docker build -t articler-web .` succeeds. - `docker run -p 18080:3000 articler-web` serves the page on
      `http://localhost:18080`.

- [x] T-0-5: docker-compose with Postgres
      Goal: `docker compose up` brings up `web` (host 18080) and
      `db` (host 13036). Web depends on db.
      Touches: `docker-compose.yml`, `.env.example`.
      Acceptance: - `docker compose up -d` exposes web on 18080, db on 13036. - `psql postgres://articler:articler@localhost:13036/articler -c '\dt'`
      connects (empty result is fine).

- [x] T-0-6: Drizzle ORM wired up with one trivial migration
      Goal: A `users` table exists in the dev DB. `pnpm db:migrate`
      applies migrations.
      Touches: `drizzle.config.ts`, `src/server/db/schema.ts`,
      `src/server/db/client.ts`, `drizzle/0000_init.sql`,
      `package.json` (scripts: `db:generate`, `db:migrate`).
      Acceptance: - `pnpm db:migrate` against the compose DB creates the `users` table. - Re-running is a no-op.

- [ ] T-0-7: Repository hygiene
      Goal: README with one-command boot instructions, `.env.example`
      with all required keys (`DATABASE_URL`, `OPENROUTER_API_KEY`,
      `AUTH_SECRET`, stock API keys), `.gitignore` covers
      `logs/`, `data/`, `.next/`, `node_modules/`.
      Touches: `README.md`, `.env.example`, `.gitignore`.
      Acceptance: - A fresh clone + `cp .env.example .env && docker compose up`
      works end-to-end per the README.

<!-- PLANING_CHECKPOINT -->

---

## Epic 1 — Auth + user-scoped shell

**Status: TBD**
Intent: email/password registration + login (Auth.js credentials
provider, Argon2id), session cookies, a protected `/app` route group, a
logged-in shell with a placeholder dashboard. Per-request `requireUser`
helper used in every API handler.

## Epic 2 — OpenRouter client, model router, JSONL logger, budget tracker

**Status: TBD**
Intent: `src/server/llm/openrouter.ts` thin client; `MODEL_ROUTING`
config; `routeChat`, `routeSearch`, `routeImage` typed helpers; pricing
table; `wrapWithLogging` decorator producing JSONL lines under
`logs/runs/`; `runs` table populated; per-session/user cost aggregation
helper; one integration test that records a fake call end-to-end.

## Epic 3 — Platform Profile CRUD

**Status: TBD**
Intent: schema, server actions, list/create/edit/delete UI under
`/app/profiles`, validation with Zod, e2e Playwright happy path.

## Epic 4 — Session shell + state machine + SSE bus

**Status: TBD**
Intent: `sessions` and `events` tables; `runner.ts` state machine;
`/api/stream/:id` SSE endpoint; session page with two-pane layout
(workbench + chat); `awaiting_user` round-trip via
`/api/sessions/:id/respond`. No real LLM stages yet — wire up with a
"hello" stage.

## Epic 5 — Briefing + planning stages

**Status: TBD**
Intent: implement `clarify_brief`, `propose_angles`, `build_plan`
stages with the smart model. Plan editor UI (tree view, inline edit,
approve to lock). Unit tests with a stub LLM; eval fixtures recorded.

## Epic 6 — Source research (Sonar Pro)

**Status: TBD**
Intent: `plan_search_hypotheses`, `formulate_queries`, `web_search`,
`summarize_source` stages. Source review UI (accept/reject per item,
attach to section). Cache identical queries within a session.

## Epic 7 — Drafting + rewrite mode

**Status: TBD**
Intent: `draft_section` stage iterating sections; rewrite-mode entrypoint
(brief includes one or more source articles); per-section regenerate
with user instruction; live draft pane.

## Epic 8 — Review: critics + fact-checker

**Status: TBD**
Intent:

- **Critics**: a critic registry seeded with the built-in personas
  (`editorial`, `audience_fit`, `methodology`, `style`, `structure`,
  `headline`, `seo_discoverability`); a generic `run_critic` stage that
  takes a `Critic` record + draft and emits typed `Finding[]`; a
  `review` stage that fans out the session's `active_critics` in
  parallel and persists a `critique_round` with all findings; a custom
  ad-hoc critic flow that lets the user provide a prompt fragment;
  per-finding actions (dismiss / apply verbatim / send to drafter for
  span-scoped rewrite). Critics never write `draft_md` — only the
  drafting agent does, invoked via the existing rewrite path.
- **Fact-checker**: `extract_claims` (smart) → `verify_claim` (search,
  fan-out over check-worthy claims, reusing accepted `sources` first)
  → `adjudicate_claim` (smart) producing per-claim verdicts with
  citations. Idempotency keyed on `span_hash` so repeat runs skip
  unchanged spans unless the user forces a fresh run.
- **UI**: review view with two tabs (Critique / Fact-check) inside the
  workbench pane, span-clicks scrolling the draft, history of rounds
  preserved.
- **Eval fixtures** for each critic and for the fact-check pipeline.

## Epic 9 — Decoration suggestions

**Status: TBD**
Intent: `propose_decoration` stage; UI overlay on the draft showing
proposed callouts/quotes/code blocks/tables; per-suggestion accept/reject
applying the change to `draft_md`.

## Epic 10 — Image subsystem

**Status: TBD**
Intent: `propose_image_slots`, `compose_image_prompt`,
`prerender_images` (NanoBanana + Image 2) stages; structured JSON prompt
editor; pre-render gallery with selection; stock pathway
(`stock_keywords` + Unsplash/Pexels/Pixabay search + selection); image
storage on local volume; references inserted into the draft.

## Epic 11 — Export

**Status: TBD**
Intent: Markdown (canonical), HTML (per-profile rules), DOCX, PDF.
Export route returns a downloadable artifact bundle (article + images).

## Epic 12 — Eval harness

**Status: TBD**
Intent: `pnpm eval --stage <name> --fixture <id>` runner; rubric judge
using fast model; result JSON written under `logs/evals/`; CI workflow
gated behind an explicit env flag.

## Epic 13 — Budget enforcement (v2)

**Status: TBD**
Intent: per-user and per-session caps in user settings; router
short-circuits with a typed error when a call would exceed the cap; UI
surfaces the remaining budget.

## Epic 14 — Ralph loop integration

**Status: TBD**
Intent: a small driver that, given the repo, decides whether to run the
planner or the implementer prompt next, executes lint/typecheck/test
between iterations, and commits on green.

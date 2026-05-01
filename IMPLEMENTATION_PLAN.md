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

- [x] T-0-7: Repository hygiene
      Goal: README with one-command boot instructions, `.env.example`
      with all required keys (`DATABASE_URL`, `OPENROUTER_API_KEY`,
      `AUTH_SECRET`, stock API keys), `.gitignore` covers
      `logs/`, `data/`, `.next/`, `node_modules/`.
      Touches: `README.md`, `.env.example`, `.gitignore`.
      Acceptance: - A fresh clone + `cp .env.example .env && docker compose up`
      works end-to-end per the README.

---

## Epic 1 — Auth + user-scoped shell

**Status: planned**
**Goal:** Email/password registration + login via Auth.js credentials
provider with Argon2id hashing, JWT session cookies, a protected `(app)`
route group with a placeholder dashboard, and a `requireUser` helper
ready for use by future API handlers.

### Tasks

- [x] T-1-1: Install Auth.js v5 + argon2 dependencies
      Goal: Add the runtime libraries the rest of the epic depends on.
      Touches: `package.json`, `pnpm-lock.yaml`.
      Acceptance:
        - `pnpm install` exits 0.
        - `package.json` lists `next-auth@^5` (beta is fine) and `argon2`.
        - `pnpm typecheck` and `pnpm lint` still exit 0.
      Notes: No code changes yet — dependency-only commit.

- [x] T-1-2: Argon2id password-hash utility with round-trip test
      Goal: A small, typed module for hashing and verifying passwords
      using Argon2id defaults, isolated from Auth.js concerns.
      Touches: `src/server/auth/password.ts`,
      `tests/unit/auth/password.test.ts`.
      Acceptance:
        - `hashPassword(plain): Promise<string>` returns a string starting
          with `$argon2id$`.
        - `verifyPassword(plain, hash)` returns `true` for the matching
          plain and `false` for a wrong password.
        - `pnpm test` runs the new test and it passes.

- [x] T-1-3: Auth.js v5 config with Credentials provider + route handler
      Goal: Wire Auth.js using JWT sessions and a Credentials provider
      that looks up users in the DB and verifies their password via the
      T-1-2 utility.
      Touches: `src/server/auth/config.ts`,
      `src/app/api/auth/[...nextauth]/route.ts`,
      `.env.example` (already has `AUTH_SECRET`, confirm only).
      Acceptance:
        - `src/server/auth/config.ts` exports `auth`, `signIn`,
          `signOut`, and `handlers` from a `NextAuth({...})` call.
        - The Credentials provider's `authorize` returns `{ id, email }`
          on success, `null` on failure (wrong password or unknown email).
        - Session strategy is `jwt`; cookie options include
          `httpOnly: true`, `sameSite: 'lax'`, `secure` in production.
        - `GET http://localhost:3000/api/auth/providers` returns JSON
          listing `credentials` when running `pnpm dev`.
        - `pnpm typecheck` exits 0.

- [x] T-1-4: `requireUser` server helper
      Goal: A single helper for server components, server actions, and
      route handlers to obtain the current user or redirect to `/login`.
      Touches: `src/server/auth/require-user.ts`,
      `tests/unit/auth/require-user.test.ts`.
      Acceptance:
        - `requireUser()` returns `{ id: number, email: string }` when a
          session exists, and triggers a redirect to `/login` otherwise.
        - Unit test mocks the `auth()` import and asserts both branches
          (returns user / calls `redirect`).
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-1-5: Registration page + server action
      Goal: A `/register` page with an email + password form whose server
      action validates input, hashes the password, inserts a `users`
      row, and redirects to `/login`.
      Touches: `src/app/(auth)/register/page.tsx`,
      `src/app/(auth)/register/actions.ts`,
      `tests/unit/auth/register-action.test.ts`.
      Acceptance:
        - Visiting `/register` (via `pnpm dev`) renders a form with
          `email` and `password` fields and a submit button.
        - `registerUser` action: Zod-validates the input
          (email format, password ≥ 8 chars), inserts a row using the
          drizzle client and the T-1-2 hash util, and redirects to
          `/login` on success.
        - On duplicate email the action returns a typed error
          (`{ ok: false, error: 'email_taken' }`); test asserts both the
          happy path (row inserted, redirect called) and the duplicate
          path against a test DB or a mocked drizzle client.
        - `pnpm test` exits 0.

- [ ] T-1-6: Login page + signIn server action
      Goal: A `/login` page that signs the user in via Auth.js and
      redirects to `/dashboard`.
      Touches: `src/app/(auth)/login/page.tsx`,
      `src/app/(auth)/login/actions.ts`.
      Acceptance:
        - `/login` renders a form with `email` and `password` fields.
        - The server action calls `signIn('credentials', { email,
          password, redirectTo: '/dashboard' })` from the T-1-3 config.
        - On invalid credentials the page surfaces an error message
          (returned from the action, not thrown).
        - Manually verifiable via `pnpm dev`: registering then logging
          in lands on `/dashboard` (works once T-1-7/T-1-8 land).
        - `pnpm typecheck` exits 0.
      Decision needed: Where to send the user after login. Default:
      `/dashboard`.

- [ ] T-1-7: Protected `(app)` route group with layout-level guard
      Goal: A route group whose layout calls `requireUser()`, ensuring
      every page beneath it is reachable only by authenticated users.
      Touches: `src/app/(app)/layout.tsx`.
      Acceptance:
        - `(app)/layout.tsx` is a server component that awaits
          `requireUser()` and renders `{children}` inside a minimal
          shell (header with the user's email + a Logout button slot).
        - Hitting any `(app)`-grouped route while logged out redirects
          to `/login` (verified manually once T-1-8 lands).
        - `pnpm typecheck` and `pnpm lint` exit 0.
      Notes: No Next middleware in v1 — layout-level guard is enough.
      Decision needed: middleware vs layout guard. Default: layout guard.

- [ ] T-1-8: Placeholder dashboard at `/dashboard` with logout
      Goal: A trivial authenticated landing page that proves the loop
      works end-to-end.
      Touches: `src/app/(app)/dashboard/page.tsx`,
      `src/app/(app)/logout-button.tsx`,
      `src/app/(app)/actions.ts`.
      Acceptance:
        - `/dashboard` (under the `(app)` group) renders "Signed in as
          <email>" using the user from `requireUser()`.
        - A `LogoutButton` client component invokes a server action that
          calls `signOut({ redirectTo: '/login' })`.
        - After clicking Logout the user is redirected to `/login` and
          a subsequent visit to `/dashboard` redirects back to `/login`.
        - `pnpm typecheck` and `pnpm lint` exit 0.

- [ ] T-1-9: Integration test — register → login → protected access
      Goal: A single integration test exercising the auth happy path
      end-to-end against the running app and a real test DB.
      Touches: `tests/integration/auth-flow.test.ts`,
      `vitest.config.ts` (only if a separate `integration` project is
      added — otherwise leave untouched).
      Acceptance:
        - The test: (a) calls the `registerUser` action with a fresh
          email, (b) calls the `login` action with the same credentials
          and captures the resulting session cookie, (c) issues a
          `fetch` to `/dashboard` with the cookie and asserts a 200,
          (d) issues the same fetch without the cookie and asserts a
          redirect to `/login`.
        - `pnpm test` runs and the test passes against the compose DB.
        - The test cleans up the user row it created (or runs inside a
          transaction that rolls back).
      Notes: If spinning up a real Next server in-process is awkward,
      this can be a route-handler-level test that mounts the relevant
      handlers; the four observable assertions above must still hold.

<!-- PLANING_CHECKPOINT -->

---

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

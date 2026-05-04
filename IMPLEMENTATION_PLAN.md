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

- [x] T-1-6: Login page + signIn server action
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

- [x] T-1-7: Protected `(app)` route group with layout-level guard
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

- [x] T-1-8: Placeholder dashboard at `/dashboard` with logout
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

- [x] T-1-9: Integration test — register → login → protected access
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

---

## Epic 2 — OpenRouter client, model router, JSONL logger, budget tracker

**Status: planned**
**Goal:** `src/server/llm/openrouter.ts` thin client; `MODEL_ROUTING`
config; `routeChat`, `routeSearch`, `routeImage` typed helpers; pricing
table; `wrapWithLogging` decorator producing JSONL lines under
`logs/runs/`; `runs` table populated; per-session/user cost aggregation
helper; one integration test that records a fake call end-to-end.

### Tasks

- [x] T-2-1: `MODEL_ROUTING` config + `ModelClass` type
      Goal: A single source of truth for which OpenRouter model serves
      each model class, plus a typed alias the rest of the LLM layer
      can import.
      Touches: `src/server/llm/models.ts`,
      `tests/unit/llm/models.test.ts`.
      Acceptance:
        - `models.ts` exports `MODEL_ROUTING` matching the table in
          `ARCHITECTURE.md` §6 (`smart`, `fast`, `search`, `image` keys
          with `primary` and optional `fallback`/`secondary` strings).
        - `models.ts` exports a `ModelClass` union type
          (`'smart' | 'fast' | 'search' | 'image'`).
        - `models.ts` exports a helper `modelsFor(cls: ModelClass):
          string[]` returning `[primary, ...fallbacks]` in order.
        - Unit test asserts each class resolves to a non-empty list and
          that `modelsFor('image')` returns both NanoBanana and Image 2.
        - `pnpm typecheck` and `pnpm test` exit 0.

- [x] T-2-2: Pricing table + cost calculator
      Goal: A pure function that, given a model name and token counts,
      returns the USD cost of a single call.
      Touches: `src/server/llm/pricing.ts`,
      `tests/unit/llm/pricing.test.ts`.
      Acceptance:
        - `pricing.ts` exports `MODEL_PRICES` keyed by the model
          strings used in `MODEL_ROUTING`, each with
          `{ promptPerMTok: number, completionPerMTok: number }`.
        - Exports `costFor(model: string, prompt: number, completion:
          number): number` returning USD as a `number` (not a string),
          rounded to 6 decimals.
        - Returns `0` and logs a single warning if the model is
          unknown — never throws (unknown models must not break a
          logging path).
        - Unit test asserts: a known model returns a non-zero cost
          matching a hand-computed value, and an unknown model returns
          `0` without throwing.
        - `pnpm test` exits 0.
      Decision needed: exact USD rates per model. Default: use the
      current OpenRouter list prices as of 2026-05-01 (Opus 4.7
      \$15/\$75 per Mtok, Haiku 4.5 \$1/\$5, Sonar Pro \$3/\$15, GPT-5
      \$10/\$30, GPT-5-mini \$0.60/\$2.40, image models priced
      per-image — leave token rates at 0 and add a separate
      `IMAGE_PRICES` map keyed by model with `perImage: number`).
      Treat the numbers as approximate and add a `// TODO: refresh`
      comment.

- [x] T-2-3: `runs` table — schema + migration
      Goal: Persist a thin row per LLM call so cost aggregation can be
      computed by SQL aggregation.
      Touches: `src/server/db/schema.ts`, `drizzle/0001_*.sql`
      (generated).
      Acceptance:
        - `schema.ts` adds a `runs` table with the columns from
          `ARCHITECTURE.md` §4: `id` (serial PK), `session_id`
          (integer, nullable for now — sessions table arrives in
          Epic 4), `user_id` (integer, nullable, FK to `users.id` when
          present), `stage` (text), `task` (text), `model_class`
          (text), `model_name` (text), `prompt_tokens` (integer),
          `completion_tokens` (integer), `cost_usd` (numeric(12,6)),
          `latency_ms` (integer), `ts` (timestamp default now),
          `payload_path` (text).
        - `pnpm db:generate` produces a new SQL migration that, when
          applied via `pnpm db:migrate` against the compose DB, creates
          the table.
        - Re-running `pnpm db:migrate` is a no-op.
        - `pnpm typecheck` exits 0.
      Decision needed: should `session_id` be a FK now or later?
      Default: nullable integer with no FK — the FK is added in
      Epic 4 when the `sessions` table is created. `user_id` already
      has a target table so it can take an FK.

- [x] T-2-4: Thin OpenRouter HTTP client
      Goal: A typed `fetch` wrapper for the two OpenRouter endpoints
      we need: chat completions and image generation. No business
      logic, no logging, no fallback.
      Touches: `src/server/llm/openrouter.ts`,
      `tests/unit/llm/openrouter.test.ts`.
      Acceptance:
        - Exports `openrouterChat({ model, messages, ... })` posting
          to `https://openrouter.ai/api/v1/chat/completions` with
          `Authorization: Bearer ${OPENROUTER_API_KEY}` and returning
          a typed `{ id, model, choices, usage: { prompt_tokens,
          completion_tokens } }` shape.
        - Exports `openrouterImage({ model, prompt, ... })` posting
          to `/api/v1/images/generations` returning `{ data: [{ url |
          b64_json }] }`.
        - Throws a typed `OpenRouterError` (subclass of `Error`,
          carrying `status` and `body`) on non-2xx responses.
        - Reads the API key from `process.env.OPENROUTER_API_KEY`;
          throws synchronously at call time (not import time) when the
          key is missing.
        - Unit test mocks `global.fetch` and asserts: (a) the
          authorization header is set, (b) a 200 chat response is
          parsed into the typed shape, (c) a 500 chat response throws
          `OpenRouterError` with `status === 500`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-2-5: Model router (`routeChat` / `routeSearch` / `routeImage`)
      Goal: A class-aware wrapper around the T-2-4 client that picks
      the model from `MODEL_ROUTING` and retries the fallback on
      transient failure.
      Touches: `src/server/llm/router.ts`,
      `tests/unit/llm/router.test.ts`.
      Acceptance:
        - Exports `routeChat({ messages, ... })` (uses class `smart`
          unless `class: 'fast'` is passed), `routeSearch({ messages,
          ... })` (class `search`), `routeImage({ prompt, ... })`
          (class `image`).
        - Each helper returns
          `{ result, modelUsed, modelClass, promptTokens,
          completionTokens, latencyMs }`.
        - On a thrown `OpenRouterError` with `status >= 500` or a
          network error, retries the next model from `modelsFor(cls)`
          exactly once; non-transient errors (4xx) are not retried.
        - Unit test injects a fake `openrouterChat` that fails 5xx on
          the primary and succeeds on the fallback, and asserts the
          returned `modelUsed` equals the fallback string.
        - Unit test asserts a 4xx error is **not** retried.
        - `pnpm typecheck` exits 0.

- [x] T-2-6: JSONL logger with daily rotation
      Goal: Append-only logger that writes one JSON object per line to
      `logs/runs/YYYY-MM-DD.jsonl`, creating the directory and the
      day's file on demand.
      Touches: `src/server/logging/jsonl.ts`,
      `tests/unit/logging/jsonl.test.ts`.
      Acceptance:
        - Exports `appendRunLog(entry: object, opts?: { now?: Date,
          baseDir?: string }): Promise<{ path: string }>` returning
          the absolute file path written to.
        - Default `baseDir` is `logs/runs` resolved against
          `process.cwd()`.
        - File name uses UTC `YYYY-MM-DD` derived from `now ?? new
          Date()`.
        - Each call writes exactly one line ending in `\n`. Two calls
          on the same UTC day append to the same file; calls on
          different days write to different files.
        - Unit test uses `os.tmpdir()` as `baseDir`, writes two
          entries on the same fake `now`, asserts the file contains
          two valid JSON lines in order.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-2-7: `wrapWithLogging` — JSONL line + `runs` row
      Goal: A decorator over a router call that, on success, writes
      the full request/response pair to JSONL **and** inserts a thin
      `runs` row.
      Touches: `src/server/logging/wrap.ts`,
      `tests/unit/logging/wrap.test.ts`.
      Acceptance:
        - Exports `wrapWithLogging<T extends RouterResult>(args: {
          stage: string; task: string; sessionId?: number; userId?:
          number; call: () => Promise<T>; request: unknown }):
          Promise<T & { runId: number }>`.
        - On success: (1) calls `appendRunLog` with
          `{ ts, run_id (uuid), user_id, session_id, stage, task,
          model_class, model, prompt_tokens, completion_tokens,
          cost_usd, latency_ms, request, response }`, (2) inserts a
          row into `runs` with the same fields **minus** `request`
          and `response`, but **plus** `payload_path` set to the
          file returned by `appendRunLog`, (3) returns the original
          router result enriched with `runId`.
        - On thrown error: still writes a JSONL line tagged
          `error: true` with the error message and inserts no `runs`
          row; the error is re-thrown.
        - Cost is computed via `costFor` / `IMAGE_PRICES` from T-2-2.
        - Unit test stubs the router call, the JSONL writer, and a
          drizzle-style `db.insert` chain; asserts the writer was
          called with the expected fields and the insert was called
          with the matching thin row.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-2-8: Cost aggregation helpers
      Goal: SQL-backed read helpers for the running cost of a session
      and a user, used later by the UI header and budget enforcement.
      Touches: `src/server/logging/aggregate.ts`,
      `tests/unit/logging/aggregate.test.ts`.
      Acceptance:
        - Exports `getSessionCost(sessionId: number): Promise<number>`
          and `getUserCost(userId: number): Promise<number>` — each
          returns the `SUM(cost_usd)` of the matching rows, or `0`
          when none exist.
        - Both helpers go through `db` from `src/server/db/client.ts`
          and use Drizzle's typed query builder (no raw SQL strings).
        - Unit test mocks the drizzle client to return canned aggregate
          results and asserts the helpers unwrap them to plain numbers
          (including the 0-rows case).
        - `pnpm typecheck` exits 0.

- [x] T-2-9: Integration test — fake call recorded end-to-end
      Goal: One integration test that drives `wrapWithLogging` around
      a stubbed router, against the real test DB and a temp log dir,
      and verifies the JSONL line, the `runs` row, and the cost
      aggregator agree.
      Touches: `tests/integration/llm-logging.test.ts`.
      Acceptance:
        - The test sets `process.env.LOGS_DIR` (or passes a `baseDir`
          option) to a fresh temp directory, stubs `openrouterChat` to
          return a deterministic `{ usage, choices }`, and invokes
          `wrapWithLogging` with `stage: 'test'`, `task: 'integ-1'`,
          a known `userId`.
        - After the call: (a) the JSONL file in the temp dir contains
          exactly one line with the expected `stage`, `task`, `model`,
          and `cost_usd`; (b) `SELECT * FROM runs WHERE task =
          'integ-1'` returns exactly one row with the matching cost
          and `payload_path` pointing at that file; (c)
          `getUserCost(userId)` returns the same cost number.
        - The test cleans up the inserted `runs` row and the temp
          directory afterward.
        - `pnpm test` runs the test against the compose DB and it
          passes.
      Notes: This test is the canary that the chain
      router → logger → DB → aggregator is wired correctly; later
      stages reuse the same plumbing.

---

## Epic 3 — Platform Profile CRUD

**Status: planned**
**Goal:** A logged-in user can create, view, edit, and delete platform
profiles under `/profiles`. Profiles are persisted in the `profiles`
table with strict per-user isolation. All inputs are Zod-validated. A
Playwright happy-path e2e covers the full CRUD loop.

### Tasks

- [x] T-3-1: `profiles` table — schema + migration
      Goal: Persist platform profiles per user, with all FR-PROF-1
      fields, ready for the Epic 4 `sessions.profile_id` FK to land on
      top.
      Touches: `src/server/db/schema.ts`, `drizzle/0002_*.sql`
      (generated).
      Acceptance:
        - `schema.ts` adds a `profiles` table with columns:
          `id` (serial PK), `user_id` (integer NOT NULL, FK to
          `users.id`, ON DELETE CASCADE), `name` (text NOT NULL),
          `format` (text NOT NULL), `style` (text NOT NULL),
          `audience` (text NOT NULL), `target_volume_min` (integer
          NOT NULL), `target_volume_max` (integer NOT NULL),
          `markup_rules` (jsonb NOT NULL DEFAULT `'{}'::jsonb`),
          `extra_prompt` (text NOT NULL DEFAULT `''`),
          `created_at` (timestamp default now NOT NULL).
        - `pnpm db:generate` produces a new SQL migration that, applied
          via `pnpm db:migrate` against the compose DB, creates the
          table.
        - Re-running `pnpm db:migrate` is a no-op.
        - `pnpm typecheck` exits 0.

- [x] T-3-2: Profile validation schema + shared types
      Goal: A single Zod schema shared by create and update server
      actions, plus the canonical `format` enum.
      Touches: `src/server/profiles/schema.ts`,
      `tests/unit/profiles/schema.test.ts`.
      Acceptance:
        - Exports `PROFILE_FORMATS` as a `readonly` tuple
          `['long_read', 'listicle', 'news', 'tutorial']` and a
          `ProfileFormat` union derived from it.
        - Exports `profileInputSchema` (Zod) requiring:
          `name` (1..120 chars), `format` (enum from `PROFILE_FORMATS`),
          `style` (1..200 chars), `audience` (1..500 chars),
          `targetVolumeMin` (positive int), `targetVolumeMax` (positive
          int with `>= targetVolumeMin`), `markupRules` (a `z.record(
          z.string(), z.unknown())`), `extraPrompt` (string, default
          `''`).
        - The `targetVolumeMax >= targetVolumeMin` cross-field rule
          attaches its error to the `targetVolumeMax` path.
        - Exports `ProfileInput = z.infer<typeof profileInputSchema>`.
        - Unit test asserts: a valid payload parses; `max < min`
          fails with the error on `targetVolumeMax`; a missing
          required field fails with an error on that field's path; an
          unknown `format` value fails.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-3-3: User-scoped Profile repository helpers
      Goal: A small repo module that always filters by `userId`, so
      cross-user reads/writes are impossible by construction.
      Touches: `src/server/profiles/repo.ts`,
      `tests/unit/profiles/repo.test.ts`.
      Acceptance:
        - Exports `listProfiles(userId: number)`,
          `getProfile(userId: number, id: number)`,
          `createProfile(userId: number, input: ProfileInput)`,
          `updateProfile(userId: number, id: number, input:
          ProfileInput)`, `deleteProfile(userId: number, id: number)`.
        - `getProfile`, `updateProfile`, and `deleteProfile` resolve
          to `null` / no row affected when the target row is not
          owned by `userId` — they always filter by both `id` AND
          `user_id` in the same query.
        - `createProfile` binds `user_id` from the argument, never
          from the input.
        - Unit test mocks the drizzle client and asserts each helper
          builds a `where` that includes the `user_id` predicate;
          `createProfile` ignores any `userId` field smuggled into
          `input`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-3-4: Profiles list page at `/profiles`
      Goal: A server component listing the current user's profiles
      with links to create / edit and a delete control on each row.
      Touches: `src/app/(app)/profiles/page.tsx`,
      `src/app/(app)/profiles/delete-button.tsx`.
      Acceptance:
        - `/profiles` is a server component that awaits
          `requireUser()` and `listProfiles(user.id)`, then renders a
          table (or list) showing each profile's `name`, `format`, and
          `target_volume_min..target_volume_max` range.
        - Each row links to `/profiles/[id]/edit` and exposes a delete
          control (form posting to the T-3-7 action with the row id).
        - A header link "New profile" points to `/profiles/new`.
        - Hitting `/profiles` while logged out redirects to `/login`
          (already enforced by the `(app)` layout guard).
        - `pnpm typecheck` and `pnpm lint` exit 0.

- [x] T-3-5: Create profile page + server action
      Goal: `/profiles/new` renders a form whose server action
      validates and inserts a row, then redirects to `/profiles`.
      Touches: `src/app/(app)/profiles/new/page.tsx`,
      `src/app/(app)/profiles/actions.ts`,
      `tests/unit/profiles/create-action.test.ts`.
      Acceptance:
        - `/profiles/new` renders a form with inputs for every field
          in `profileInputSchema`: `name` (text), `format` (select
          backed by `PROFILE_FORMATS`), `style` (text), `audience`
          (text), `targetVolumeMin` and `targetVolumeMax` (number),
          `markupRules` (textarea holding JSON, parsed in the action),
          `extraPrompt` (textarea).
        - `createProfileAction` (server action) reads `FormData`,
          parses `markupRules` from JSON, validates with
          `profileInputSchema`, calls `createProfile(user.id, input)`,
          and `redirect('/profiles')` on success.
        - On validation or JSON-parse failure, the action returns
          `{ ok: false, error: 'validation', issues: ... }`; the page
          surfaces the error message above the form (no throw).
        - Unit test mocks `requireUser` and `createProfile` and
          asserts: happy path calls `createProfile` with the user id
          and validated input; invalid payload returns
          `{ ok: false, error: 'validation' }` and does not call the
          repo.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-3-6: Edit profile page + server action
      Goal: `/profiles/[id]/edit` pre-fills the form and updates the
      row on submit; returns 404 when the profile is not owned by the
      current user.
      Touches: `src/app/(app)/profiles/[id]/edit/page.tsx`,
      `src/app/(app)/profiles/actions.ts`.
      Acceptance:
        - The page calls `getProfile(user.id, id)`; when the helper
          returns `null` the page calls Next's `notFound()` (renders
          the 404 page).
        - The form fields are pre-filled with the current row's
          values; the form posts to `updateProfileAction` with the id
          in a hidden field.
        - `updateProfileAction` validates with `profileInputSchema`,
          calls `updateProfile(user.id, id, input)`, and
          `redirect('/profiles')` on success; validation errors return
          `{ ok: false, error: 'validation', issues: ... }` like
          T-3-5.
        - Manually verifiable via `pnpm dev`: editing a name and
          submitting changes the value on `/profiles`.
        - `pnpm typecheck` exits 0.

- [x] T-3-7: Delete profile server action
      Goal: A POST-only server action invoked by the list page's
      delete control that removes the row and refreshes the list.
      Touches: `src/app/(app)/profiles/actions.ts`,
      `tests/unit/profiles/delete-action.test.ts`.
      Acceptance:
        - `deleteProfileAction` reads `id` from `FormData`, coerces it
          to a positive integer (rejects otherwise), calls
          `deleteProfile(user.id, id)`, then calls
          `revalidatePath('/profiles')` and returns.
        - Unit test mocks `requireUser` and `deleteProfile` and
          asserts: a valid id calls `deleteProfile` with the current
          user's id and the parsed id; a non-numeric id does not call
          the repo.
        - Manually verifiable via `pnpm dev`: clicking Delete on the
          list removes the row without a full page reload's worth of
          stale data.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-3-8: Install + configure Playwright
      Goal: Add `@playwright/test`, scaffold a config that points at
      `tests/e2e`, and add a `pnpm e2e` script. No real test yet —
      that ships in T-3-9.
      Touches: `package.json`, `pnpm-lock.yaml`,
      `playwright.config.ts`, `tests/e2e/.gitkeep`, `.gitignore`.
      Acceptance:
        - `pnpm install` adds `@playwright/test` to `devDependencies`.
        - `playwright.config.ts` exists, sets `testDir: 'tests/e2e'`,
          `use.baseURL: 'http://localhost:3000'`, and a `webServer`
          entry that launches `pnpm dev` with
          `reuseExistingServer: !process.env.CI`.
        - `package.json` exposes `pnpm e2e` invoking
          `playwright test`.
        - `.gitignore` covers `test-results/` and
          `playwright-report/`.
        - `pnpm e2e` exits 0 (no tests collected yet is fine — the
          binary must run).
        - `pnpm typecheck` and `pnpm lint` still exit 0.
      Decision needed: dev server vs prod build for the test web
      server. Default: `pnpm dev` with `reuseExistingServer` for fast
      local iteration; switching to `pnpm build && pnpm start` in CI
      can be a follow-up.

- [x] T-3-9: Playwright happy-path e2e for profile CRUD
      Goal: One e2e test that registers a user, logs in, and walks
      through create / edit / delete on `/profiles`.
      Touches: `tests/e2e/profiles.spec.ts`.
      Acceptance:
        - The spec uses a unique random email per run
          (e.g., `e2e-${Date.now()}-${rand}@example.com`) to avoid
          collisions on the shared compose DB.
        - Steps, asserted in order: (a) `/register` form submission
          succeeds and redirects to `/login`; (b) `/login` form
          submission succeeds and lands on `/dashboard`; (c)
          navigating to `/profiles` shows an empty (or pre-existing)
          list; (d) clicking "New profile", filling the form, and
          submitting redirects to `/profiles` and the new row appears
          (assert by `name`); (e) clicking the row's edit link,
          changing the name, and submitting reflects the updated name
          on `/profiles`; (f) clicking Delete removes the row from
          `/profiles`.
        - `pnpm e2e` runs against the compose DB (web on host port
          18080) and passes locally. The spec uses
          `process.env.E2E_BASE_URL ?? 'http://localhost:18080'` to
          override the default `webServer` `baseURL` when running
          against compose.
        - The test does not need to clean up the registered user —
          the random email guarantees no future collision.
      Notes: If the compose web takes time to come up before Playwright
      attaches, prefer running against `pnpm dev` via the
      `webServer` config; both modes must be supported.

## Epic 4 — Session shell + state machine + SSE bus

**Status: planned**
**Goal:** A logged-in user can create a session bound to a profile,
land on a two-pane session page, click "Start", and observe the
runner execute a no-op `hello` stage end-to-end: emit an
`agent_message`, park on `userInput`, accept the user's response via
`/api/sessions/:id/respond`, and advance the session state to `done`.
Events are persisted in the `events` table and streamed live to the
chat pane via `/api/stream/[sessionId]` (SSE). No real LLM stages
yet — this epic wires the plumbing.

### Tasks

- [x] T-4-1: `sessions` table — schema + migration; tighten `runs.session_id`
      Goal: Persist sessions per user with all forward-compatible JSONB
      slots from `ARCHITECTURE.md` §4 in place, and add the `runs ⇄
      sessions` FK that was deferred in T-2-3.
      Touches: `src/server/db/schema.ts`, `drizzle/0003_*.sql`
      (generated).
      Acceptance:
        - `schema.ts` adds a `sessions` table with columns:
          `id` (serial PK), `user_id` (integer NOT NULL, FK to
          `users.id` ON DELETE CASCADE), `profile_id` (integer NOT
          NULL, FK to `profiles.id` ON DELETE RESTRICT), `mode` (text
          NOT NULL — `'new' | 'rewrite'`), `state` (text NOT NULL,
          default `'briefing'`), `brief` (jsonb, nullable), `plan`
          (jsonb, nullable), `draft_md` (text, nullable),
          `active_critics` (jsonb, nullable), `decoration` (jsonb,
          nullable), `images` (jsonb, nullable), `created_at`
          (timestamp default now NOT NULL), `updated_at` (timestamp
          default now NOT NULL).
        - `runs.session_id` is altered to add a FK to `sessions.id`
          (ON DELETE SET NULL — keep run history when a session is
          deleted).
        - `pnpm db:generate` produces a new SQL migration that, applied
          via `pnpm db:migrate` against the compose DB, creates the
          table and the FK.
        - Re-running `pnpm db:migrate` is a no-op.
        - `pnpm typecheck` exits 0.
      Decision needed: `profile_id` delete behavior. Default: RESTRICT
      so a profile with sessions cannot be silently deleted; the user
      must archive or remove sessions first. Decision needed: encode
      `state` as Postgres enum or text. Default: text — the state list
      will keep changing across epics and text avoids churn.

- [x] T-4-2: `events` table — schema + migration
      Goal: Persistent activity log feeding the chat pane. Each event
      has a kind and a JSONB payload, ordered by `ts`.
      Touches: `src/server/db/schema.ts`, `drizzle/0004_*.sql`
      (generated).
      Acceptance:
        - `schema.ts` adds an `events` table with columns: `id`
          (serial PK), `session_id` (integer NOT NULL, FK to
          `sessions.id` ON DELETE CASCADE), `ts` (timestamp default
          now NOT NULL), `kind` (text NOT NULL), `payload` (jsonb NOT
          NULL DEFAULT `'{}'::jsonb`).
        - An index on `(session_id, id)` exists so the SSE replay can
          page in insertion order.
        - `pnpm db:generate` produces a new SQL migration; applied
          against the compose DB it creates the table and index;
          re-running is a no-op.
        - `pnpm typecheck` exits 0.

- [x] T-4-3: Session repo helpers (user-scoped)
      Goal: Repo module mirroring `profiles/repo.ts`: every read/write
      is filtered by `userId` so cross-user access is impossible by
      construction.
      Touches: `src/server/sessions/repo.ts`,
      `tests/unit/sessions/repo.test.ts`.
      Acceptance:
        - Exports `listSessions(userId)`, `getSession(userId, id)`,
          `createSession(userId, input: { profileId: number; mode:
          'new' | 'rewrite' })`, `updateSessionState(userId, id,
          state: string)`.
        - `getSession` and `updateSessionState` resolve to `null` /
          no row affected when the row is not owned by `userId`; both
          always filter by `id` AND `user_id`.
        - `createSession` validates that the supplied `profileId`
          belongs to `userId` (a single SQL existence check) and
          throws a typed `ProfileNotOwnedError` otherwise.
        - Unit test mocks the drizzle client and asserts: each helper
          builds a `where` including the `user_id` predicate;
          `createSession` rejects an unowned profile id.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-4-4: Sessions list + new-session page
      Goal: `/sessions` lists the user's sessions; `/sessions/new`
      lets the user pick one of their profiles and create a session,
      then redirects to the session page.
      Touches: `src/app/(app)/sessions/page.tsx`,
      `src/app/(app)/sessions/new/page.tsx`,
      `src/app/(app)/sessions/actions.ts`.
      Acceptance:
        - `/sessions` is a server component awaiting `requireUser()`
          and `listSessions(user.id)`; renders a list of sessions
          showing `id`, `state`, `created_at`, and a link to
          `/sessions/[id]`. A header link "New session" points to
          `/sessions/new`.
        - `/sessions/new` lists the user's profiles (via
          `listProfiles`); shows a form with a profile select and a
          `mode` select (`new`, `rewrite`); a server action
          `createSessionAction` creates the row via
          `createSession(user.id, ...)` and `redirect('/sessions/' +
          id)` on success.
        - On `ProfileNotOwnedError` the action returns `{ ok: false,
          error: 'profile_not_owned' }`; the page surfaces it.
        - `pnpm typecheck` and `pnpm lint` exit 0.

- [x] T-4-5: In-memory event bus + persist-and-publish helper
      Goal: A single module owning the per-session pub/sub used by SSE
      consumers, plus an `emitEvent` helper that persists to `events`
      and publishes in one call.
      Touches: `src/server/events/bus.ts`,
      `tests/unit/events/bus.test.ts`.
      Acceptance:
        - Exports `subscribe(sessionId: number, listener: (e:
          PersistedEvent) => void): () => void` returning an
          unsubscribe function. Implementation uses Node's
          `EventEmitter` keyed by session id; supports many
          subscribers per session.
        - Exports `emitEvent(sessionId: number, kind: EventKind,
          payload: unknown): Promise<PersistedEvent>` which inserts
          into `events`, then synchronously calls every subscriber
          for that session with the inserted row, then returns it.
        - Exports an `EventKind` union exactly matching
          `ARCHITECTURE.md` §11: `'state_changed' | 'task_started' |
          'task_progress' | 'task_completed' | 'artifact_updated' |
          'cost_updated' | 'agent_message' | 'awaiting_user'`.
        - Unit test stubs the drizzle insert, registers two
          subscribers for the same session id and a third for a
          different id, calls `emitEvent`, asserts the two matching
          subscribers received the event and the third did not, and
          asserts unsubscribe stops further deliveries.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-4-6: SSE route handler `/api/stream/[sessionId]`
      Goal: Authenticated SSE endpoint that replays the session's
      stored events and then streams new ones live until the client
      disconnects.
      Touches: `src/app/api/stream/[sessionId]/route.ts`,
      `tests/unit/api/stream.test.ts`.
      Acceptance:
        - `GET /api/stream/[sessionId]` calls `requireUser`; if
          `getSession(user.id, sessionId)` returns `null` it responds
          with 404. Otherwise it returns a `Response` whose body is a
          `ReadableStream` with `Content-Type: text/event-stream`,
          `Cache-Control: no-cache, no-transform`, `Connection:
          keep-alive`.
        - On open: writes `event: <kind>\ndata: <json>\n\n` for each
          row already in `events` for that session, in `id` order;
          then subscribes via `bus.subscribe` and forwards each new
          event in the same wire format.
        - When the client disconnects (`request.signal.aborted` fires)
          the handler unsubscribes and closes the stream — no
          dangling subscribers.
        - Unit test mocks `requireUser`, `getSession`, the events
          select, and `bus.subscribe`; asserts the response headers,
          that one stored event is replayed before any live event,
          and that aborting `request.signal` triggers `unsubscribe`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-4-7: `Stage` type, `StageCtx`, and a `hello` stage
      Goal: The pipeline contract from `ARCHITECTURE.md` §5 in code,
      plus one canary stage that exercises every `ctx` capability
      except the LLM.
      Touches: `src/server/pipeline/stage.ts`,
      `src/server/pipeline/stages/hello.ts`,
      `tests/unit/pipeline/hello.test.ts`.
      Acceptance:
        - `stage.ts` exports `type Stage<I, O>` matching the
          architecture shape (`name`, `modelClass`, `inputSchema`,
          `outputSchema`, `run`) and a `StageCtx` interface providing
          `emit(kind, payload)` (delegates to `bus.emitEvent`),
          `userInput<T>(prompt: string, schema: ZodSchema<T>):
          Promise<T>` (parks until the runner resolves it), `log`
          (the JSONL logger pre-tagged with `sessionId` + `stage`),
          and `llm` (the model router from T-2-5; `hello` does not
          touch it).
        - `stages/hello.ts` exports a `Stage<{}, { greeted: true }>`
          named `hello`, model class `'fast'`, that: (a) emits an
          `agent_message` "Hi! Type anything to continue.", (b) calls
          `ctx.userInput('reply', z.object({ text: z.string() }))`,
          (c) emits `task_completed` with the received text, (d)
          returns `{ greeted: true }`.
        - Unit test passes a stub `ctx` whose `userInput` resolves
          with `{ text: 'world' }` and asserts the three emitted
          events appear in order with the expected payload shapes.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-4-8: `runner.ts` — state machine with `userInput` parking
      Goal: A single in-process orchestrator that, for the current
      session state, runs the matching stage, persists the new state,
      and exposes a registry the respond endpoint can resolve.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner.test.ts`.
      Acceptance:
        - Exports `startRunner(sessionId: number, userId: number):
          Promise<void>` which: looks up the session via
          `getSession`, switches on `state`, runs the matching stage
          (epic 4 only registers `briefing → hello`), then calls
          `updateSessionState(userId, sessionId, 'done')` after the
          stage resolves and emits `state_changed` with the new
          state.
        - Exports `resolveUserInput(sessionId: number, value:
          unknown): boolean` returning `true` if a parked input
          existed and was resolved (validating against the registered
          Zod schema), `false` otherwise.
        - The `userInput` implementation registers `{ resolve, reject,
          schema }` in a `Map<number, Pending>` keyed by `sessionId`
          before emitting `awaiting_user`. Calling `resolveUserInput`
          parses the value with the schema, calls `resolve`, and
          deletes the entry.
        - Unit test runs `startRunner` against an in-memory stub of
          `getSession`/`updateSessionState`/`bus.emitEvent` and a
          fake `hello` stage; asserts that the runner parks on
          `awaiting_user`, that `resolveUserInput` advances it, and
          that the final `state_changed` event reports `done`.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Notes: Single-process only — adequate for v1 per
      `ARCHITECTURE.md` §1 ("background jobs deferred"). Multi-replica
      deployment will require a Redis-backed registry; out of scope.

- [x] T-4-9: `/api/sessions/[id]/respond` + start-session action
      Goal: The two endpoints the UI needs to drive a session: one
      that starts the runner for a session, and one that resolves a
      parked `userInput`.
      Touches: `src/app/api/sessions/[id]/respond/route.ts`,
      `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/api/respond.test.ts`.
      Acceptance:
        - `POST /api/sessions/[id]/respond` calls `requireUser`,
          checks ownership via `getSession(user.id, id)` (404
          otherwise), parses `{ value: unknown }` from the JSON body,
          and returns `{ ok: true }` if `resolveUserInput(id, value)`
          succeeds, or 409 `{ ok: false, error: 'no_pending_input' }`
          if no parked input exists, or 400 `{ ok: false, error:
          'invalid_value' }` if the schema rejects the value.
        - A server action `startSessionAction(sessionId: number)`
          (in `sessions/[id]/actions.ts`) calls `requireUser`,
          verifies ownership, and invokes `startRunner(sessionId,
          user.id)` — without awaiting it — so the action can return
          immediately while the runner emits events.
        - Unit test mocks `requireUser`, `getSession`, and
          `resolveUserInput`; asserts each branch (200 / 404 / 409 /
          400) of the respond endpoint.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Notes: The respond endpoint is a route handler (not a server
      action) because it's called from the chat client component via
      `fetch` and benefits from a typed JSON contract.

- [x] T-4-10: Session page — two-pane layout + chat over SSE
      Goal: `/sessions/[id]` renders a workbench placeholder on the
      left and a chat pane on the right; the chat pane subscribes to
      `/api/stream/[id]`, renders the event log live, and exposes a
      "Start" button (initial state) plus a reply input (when the
      most recent event is `awaiting_user`).
      Touches: `src/app/(app)/sessions/[id]/page.tsx`,
      `src/app/(app)/sessions/[id]/chat-pane.tsx`,
      `tests/e2e/sessions-hello.spec.ts`.
      Acceptance:
        - The page is a server component that calls `requireUser`,
          `getSession`, and on `null` calls `notFound()`. It renders
          a two-column layout: left column shows a workbench
          placeholder with the session's `state`; right column
          mounts the `ChatPane` client component with the session id
          as a prop.
        - `ChatPane` opens an `EventSource('/api/stream/' + id)`,
          appends each incoming event to a list in state, and renders
          the list as `[kind] payload-summary`. When the latest event
          kind is `awaiting_user`, it shows a text input + Send
          button that POSTs `{ value: { text: input } }` to
          `/api/sessions/[id]/respond`.
        - A "Start" button (visible while no events have arrived
          yet, i.e., empty initial event list) invokes
          `startSessionAction` from T-4-9.
        - Playwright e2e (`tests/e2e/sessions-hello.spec.ts`):
          registers + logs in a fresh user, creates a profile,
          creates a session, opens `/sessions/[id]`, clicks Start,
          waits for the agent_message text "Hi!" to appear, types
          "world" into the reply box, clicks Send, and asserts a
          `state_changed` entry mentioning `done` appears. `pnpm e2e`
          passes.
        - `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm e2e`
          all exit 0.

---

## Epic 5 — Briefing + planning stages

**Status: planned**
**Goal:** A logged-in user with a profile and a session can fill in a
brief in the workbench, watch the runner clarify it (if needed), pick
one of 2–4 proposed angle/methodology candidates, edit the resulting
structured plan, and lock it — at which point the session transitions
to `research`. The smart model is invoked through the existing model
router with structured-JSON output and a stubbed LLM in unit tests.
Eval fixtures are captured for the three new stages so Epic 12 can
wire them into the harness.

### Tasks

- [x] T-5-1: Brief Zod schema + types
      Goal: A typed schema describing what the briefing form collects
      and what the planning stages consume — shared between client and
      server.
      Touches: `src/server/sessions/brief.ts`,
      `tests/unit/sessions/brief.test.ts`.
      Acceptance:
        - Exports `briefSchema` (Zod) with: `topic` (1..200 chars),
          `goal` (string, max 500, default `''`), `notes` (string,
          max 2000, default `''`), `sourceArticles` (array of
          `{ url: z.string().url(), content: z.string().min(1) }`,
          default `[]`).
        - Exports `BriefInput = z.infer<typeof briefSchema>` and
          `briefSchema.parse({})` rejects (topic is required) while
          `briefSchema.parse({ topic: 'x' })` returns defaults filled
          in.
        - Unit test asserts: a valid payload parses; missing `topic`
          fails with the error on `topic`; `sourceArticles` with a
          malformed URL fails with the error on the array element's
          `url` path.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-5-2: Plan + angle Zod schemas + types
      Goal: Typed shapes for the angle/methodology candidates from
      `propose_angles` and the structured plan from `build_plan`.
      Touches: `src/server/sessions/plan.ts`,
      `tests/unit/sessions/plan.test.ts`.
      Acceptance:
        - Exports `angleSchema` (Zod) with `title` (1..160), `methodology`
          (1..80 — names like `aida`, `pas`, `inverted_pyramid`,
          `listicle`, `deep_dive`, `how_to`, `case_study` allowed as
          free strings; no enum lock-in yet), `rationale` (1..600).
        - Exports `planSectionSchema` with `id` (1..40, slug-like),
          `title` (1..160), `intent` (1..400), `expectedLength`
          (positive int, words), `keyPoints` (array of 1..200-char
          strings, length 1..10).
        - Exports `planSchema` with `thesis` (1..400),
          `targetTakeaway` (1..400), `sections` (array of
          `planSectionSchema`, length 2..20).
        - Exports `Angle`, `PlanSection`, `Plan` as
          `z.infer<...>` aliases.
        - Unit test asserts: a hand-built valid plan parses; a plan
          with a single section fails on `sections`; a section with an
          empty `keyPoints` fails on that path.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-5-3: Session repo helpers — `updateSessionBrief` / `updateSessionPlan`
      Goal: Persist the brief and plan JSONB columns through the same
      user-scoped repo style as `updateSessionState`.
      Touches: `src/server/sessions/repo.ts`,
      `tests/unit/sessions/repo.test.ts`.
      Acceptance:
        - Exports `updateSessionBrief(userId: number, id: number,
          brief: BriefInput)` and `updateSessionPlan(userId: number,
          id: number, plan: Plan)` returning the updated row or `null`
          when the row is not owned by `userId`.
        - Both helpers always filter the `WHERE` by `id` AND
          `user_id`, set `updated_at = now()`, and write the JSONB
          column verbatim (no merge).
        - Unit test mocks the drizzle client and asserts: each helper
          builds a `where` including `user_id`; happy-path returns the
          row; a non-owned id resolves to `null`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-5-4: Brief form in workbench + submit action
      Goal: When `session.state === 'briefing'`, the workbench renders
      a brief form. Submitting saves the brief, transitions the state
      to `'planning'`, and kicks off the runner.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`,
      `src/app/(app)/sessions/[id]/brief-form.tsx`,
      `src/app/(app)/sessions/[id]/actions.ts`,
      `src/server/pipeline/runner.ts`,
      `tests/unit/sessions/submit-brief-action.test.ts`.
      Acceptance:
        - The session page swaps the workbench placeholder for
          `<BriefForm />` whenever `session.state === 'briefing'`. The
          form has fields for `topic`, `goal`, `notes`, plus a
          dynamic-list editor for `sourceArticles` shown only when
          `session.mode === 'rewrite'`.
        - `submitBriefAction(sessionId, formData)` (server action):
          calls `requireUser`, parses input via `briefSchema`, calls
          `updateSessionBrief(user.id, sessionId, brief)`, then
          `updateSessionState(user.id, sessionId, 'planning')`, then
          fires `startRunner(sessionId, user.id)` without awaiting,
          then `revalidatePath('/sessions/' + sessionId)`.
        - On validation failure the action returns `{ ok: false,
          error: 'validation', issues: ... }` and the page surfaces
          the message above the form (no throw).
        - The runner's existing `'briefing'` case (which runs
          `hello`) is removed — briefing is now driven by the form,
          not a stage.
        - Unit test mocks `requireUser`, `updateSessionBrief`,
          `updateSessionState`, and `startRunner`; asserts: a valid
          payload calls all three repo/runner helpers in order with
          the expected args; an invalid payload returns
          `{ ok: false, error: 'validation' }` and calls neither
          repo helper.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.
      Notes: The `hello` stage file stays in the tree for reference
      but the runner stops invoking it. Removing the file is out of
      scope for this task.

- [x] T-5-5: Structured-JSON chat helper (`routeJsonChat`)
      Goal: A thin wrapper over `routeChat` that asks the model for a
      JSON object, parses it, and validates against a Zod schema —
      the contract every planning stage uses.
      Touches: `src/server/llm/structured.ts`,
      `tests/unit/llm/structured.test.ts`.
      Acceptance:
        - Exports `routeJsonChat<T>(args: { system: string; user:
          string; schema: ZodSchema<T>; class?: 'smart' | 'fast' }):
          Promise<{ result: T; modelUsed: string; modelClass:
          ModelClass; promptTokens: number; completionTokens: number;
          latencyMs: number }>`.
        - Internally calls `routeChat` with `messages = [{ role:
          'system', content: system }, { role: 'user', content: user
          }]` and `response_format: { type: 'json_object' }`. Parses
          `content` as JSON; on parse failure throws a typed
          `JsonChatParseError` carrying the raw content. On schema
          mismatch throws `JsonChatSchemaError` carrying the Zod
          issues.
        - Unit test stubs `routeChat` (module-level mock) to return a
          fixed `content` string and asserts: a valid JSON string
          matching the schema returns the parsed `result`; an
          unparseable string throws `JsonChatParseError`; a parseable
          but schema-invalid string throws `JsonChatSchemaError`.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Decision needed: should the helper retry on a JSON parse
      failure with a "you returned invalid JSON, retry" message?
      Default: no — first round must be valid; retries belong in the
      runner where stage-level error handling lives. Add a
      `// TODO: consider retry-on-parse-error` comment.

- [x] T-5-6: `clarify_brief` stage
      Goal: A `Stage` that asks the smart model whether the brief is
      ambiguous given the profile, returning a (possibly empty)
      list of clarifying questions.
      Touches: `src/server/pipeline/stages/clarify-brief.ts`,
      `tests/unit/pipeline/clarify-brief.test.ts`.
      Acceptance:
        - Exports `clarifyBrief: Stage<{ brief: BriefInput; profile:
          ProfileRow }, { questions: string[] }>` named
          `'clarify_brief'`, model class `'smart'`.
        - `inputSchema` is `z.object({ brief: briefSchema, profile:
          z.object({ ... required profile fields ... }) })`.
          `outputSchema` is `z.object({ questions: z.array(z.string()
          .min(1)).max(8) })`.
        - `run` builds a system prompt summarizing the profile's
          format/style/audience and a user prompt containing the
          brief; calls `routeJsonChat` with the output schema; emits
          a `task_started` event before the call and a
          `task_completed` event with `{ count: questions.length }`
          after.
        - Unit test passes a stub `ctx` whose `llm.routeJsonChat` (via
          the new helper, monkey-patched in the test) returns
          `{ result: { questions: ['Who is this for?'] } }` and
          asserts: the returned shape matches; the two events were
          emitted in order with the expected payloads.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Notes: The `ProfileRow` type is the Drizzle inferred row type
      from `src/server/db/schema.ts`. Reuse it; don't redefine.

- [x] T-5-7: `propose_angles` stage
      Goal: A `Stage` that, given brief + profile + (optional)
      clarifications, asks the smart model for 2–4 angle/methodology
      candidates with rationale.
      Touches: `src/server/pipeline/stages/propose-angles.ts`,
      `tests/unit/pipeline/propose-angles.test.ts`.
      Acceptance:
        - Exports `proposeAngles: Stage<{ brief: BriefInput; profile:
          ProfileRow; clarifications?: Array<{ question: string;
          answer: string }> }, { angles: Angle[] }>` named
          `'propose_angles'`, model class `'smart'`.
        - `outputSchema` enforces `2 <= angles.length <= 4` and each
          angle conforms to `angleSchema` from T-5-2.
        - `run` constructs a prompt including the profile's format
          and audience, the brief, and any clarifications; calls
          `routeJsonChat`; emits `task_started` and `task_completed`
          (`{ count }`) events.
        - Unit test with a stub `routeJsonChat` returning three
          angles asserts the returned shape and event sequence; a
          stub returning a single angle causes the stage to throw
          (output-schema validation rejects it).
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-5-8: `build_plan` stage
      Goal: A `Stage` that takes the chosen angle and produces a full
      `Plan` (thesis, takeaway, ordered sections).
      Touches: `src/server/pipeline/stages/build-plan.ts`,
      `tests/unit/pipeline/build-plan.test.ts`.
      Acceptance:
        - Exports `buildPlan: Stage<{ brief: BriefInput; profile:
          ProfileRow; angle: Angle; clarifications?: Array<{
          question: string; answer: string }> }, Plan>` named
          `'build_plan'`, model class `'smart'`.
        - `outputSchema` is `planSchema` from T-5-2; total section
          `expectedLength` should land within the profile's
          `target_volume_min..target_volume_max` window — the prompt
          must communicate this, but the schema does not enforce it
          (the user can edit lengths in the editor).
        - `run` calls `routeJsonChat` with a system prompt that names
          the methodology from `angle.methodology` and instructs the
          model to honor section ordering; emits `task_started`,
          `task_completed` (`{ sections: plan.sections.length }`).
        - Unit test stubs `routeJsonChat` to return a hand-built
          two-section plan and asserts the returned shape and
          emitted events.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-5-9: Runner — wire real LLM into `ctx` and add `planning` orchestration
      Goal: Replace the runner's stub `ctx.llm` with the real router,
      then implement the `'planning'` state as a chained call of
      `clarify_brief` → optional clarification parking →
      `propose_angles` → angle-selection parking → `build_plan` →
      plan-lock parking → state transition to `'research'`.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-planning.test.ts`.
      Acceptance:
        - `ctx.llm` is replaced with `{ routeChat, routeSearch,
          routeImage, routeJsonChat }` imported from
          `src/server/llm/router.ts` and `src/server/llm/structured.ts`
          — no more rejected stubs.
        - In the `'planning'` case the runner: (a) loads brief +
          profile via the repos; (b) runs `clarifyBrief` and, if
          `questions.length > 0`, parks via `ctx.userInput('clarify',
          z.object({ answers: z.array(z.string().min(1)) }))` and
          merges the answers as `clarifications`; (c) runs
          `proposeAngles`, emits `artifact_updated` with
          `{ kind: 'angles', angles }`, parks via
          `ctx.userInput('angle_choice', z.object({ index:
          z.number().int().min(0) }))`; (d) runs `buildPlan` with the
          chosen angle, persists via `updateSessionPlan`, emits
          `artifact_updated` with `{ kind: 'plan' }`; (e) parks via
          `ctx.userInput('plan_lock', z.object({ action:
          z.literal('lock') }))`; (f) calls
          `updateSessionState(userId, sessionId, 'research')` and
          emits `state_changed` with `{ state: 'research' }`.
        - Unit test stubs the three stage modules with fake `run`
          functions, stubs the repo helpers, drives the runner with
          fake `resolveUserInput` calls in sequence (one for
          clarification answers, one for angle index, one for lock),
          and asserts the events emitted, the plan persisted, and
          the final state transition.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Decision needed: do plan edits between `build_plan` and the
      lock park flow through the runner, or directly via a server
      action? Default: directly via a `savePlanEditsAction` server
      action that calls `updateSessionPlan` and emits an
      `artifact_updated` event — the runner stays parked on
      `plan_lock` and reads no in-memory plan state, so out-of-band
      edits are safe.

- [x] T-5-10: Workbench planning UI — clarifications + angle picker
      Goal: While the runner is parked on `'clarify'` or
      `'angle_choice'`, the workbench renders the matching UI driven
      by the latest SSE event.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`,
      `src/app/(app)/sessions/[id]/planning-pane.tsx`,
      `src/app/(app)/sessions/[id]/clarification-form.tsx`,
      `src/app/(app)/sessions/[id]/angle-picker.tsx`.
      Acceptance:
        - When `session.state === 'planning'`, the workbench mounts
          `<PlanningPane sessionId={id} initialPlan={session.plan} />`
          (a client component) instead of the placeholder.
        - `PlanningPane` subscribes to the same SSE stream as
          `ChatPane` (a small shared hook) and tracks the latest
          `awaiting_user.prompt` and any `artifact_updated.angles`
          payload.
        - When the latest park is `'clarify'` it renders
          `<ClarificationForm questions={...} />` (one textarea per
          question); submitting POSTs `{ value: { answers: [...] } }`
          to `/api/sessions/[id]/respond`.
        - When the latest park is `'angle_choice'` it renders
          `<AnglePicker angles={...} />` (cards with title /
          methodology / rationale and a "Choose" button each);
          choosing POSTs `{ value: { index: i } }` to the respond
          endpoint.
        - Manually verifiable via `pnpm dev` + a stubbed router (a
          dev-only env flag `LLM_STUB=1` short-circuits routeJsonChat
          to canned fixtures — see T-5-12 fixtures): submitting a
          brief lands on the clarification form, then on the angle
          picker.
        - `pnpm typecheck` and `pnpm lint` exit 0.
      Decision needed: how to ship a deterministic LLM stub for
      manual testing without paying for real calls. Default: an
      `LLM_STUB` env flag read inside `routeJsonChat` that, when
      truthy, returns the fixture JSON for the matching stage. Mark
      with `// TODO: drop once eval harness lands (Epic 12)`.

- [x] T-5-11: Workbench planning UI — plan editor + lock
      Goal: After `build_plan` runs, the workbench shows a tree-style
      editor for the plan; "Lock plan" releases the runner's
      `plan_lock` park, advancing the session to `'research'`.
      Touches: `src/app/(app)/sessions/[id]/planning-pane.tsx`,
      `src/app/(app)/sessions/[id]/plan-editor.tsx`,
      `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/sessions/save-plan-edits-action.test.ts`.
      Acceptance:
        - `PlanEditor` (client component) renders editable inputs for
          `thesis`, `targetTakeaway`, and per-section `title`,
          `intent`, `expectedLength`, and `keyPoints` (a list editor).
          Edits are debounced (500 ms) and POST to a
          `savePlanEditsAction(sessionId, plan)` server action; on
          server, the action validates `plan` with `planSchema` and
          calls `updateSessionPlan(user.id, sessionId, plan)`.
        - A "Lock plan" button POSTs `{ value: { action: 'lock' } }`
          to `/api/sessions/[id]/respond`; on success the page
          re-renders with `session.state === 'research'` (the
          workbench reverts to the placeholder for now since
          research is Epic 6).
        - Unit test mocks `requireUser` and `updateSessionPlan`;
          asserts: a valid plan calls the repo with the user id,
          session id, and validated plan; an invalid plan returns
          `{ ok: false, error: 'validation', issues: ... }` and does
          not call the repo.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-5-12: Eval fixtures for `clarify_brief`, `propose_angles`, `build_plan`
      Goal: Capture one input/expected snapshot per planning stage so
      the Epic 12 harness can replay them verbatim.
      Touches: `tests/eval/fixtures/clarify_brief/habr-longread-1.json`,
      `tests/eval/fixtures/propose_angles/habr-longread-1.json`,
      `tests/eval/fixtures/build_plan/habr-longread-1.json`,
      `tests/eval/README.md`.
      Acceptance:
        - Each fixture is a JSON file with shape `{ "input": {...},
          "expected": { "schemaRef": "<stage>.outputSchema",
          "snapshot": {...} } }`. Inputs use a hand-written brief +
          profile pair targeting a Habr long-read.
        - `tests/eval/README.md` documents the fixture format in
          ≤30 lines and lists the three captured fixtures.
        - A unit test in any of the existing
          `tests/unit/pipeline/<stage>.test.ts` files loads its
          fixture's `input` and runs the stage with a stub
          `routeJsonChat` returning `expected.snapshot`, then asserts
          the stage's return equals `expected.snapshot`. (One per
          stage — this proves the fixtures load and the stage's
          schema accepts the snapshot.)
        - `pnpm test` exits 0.
      Notes: No real LLM calls; the eval harness itself ships in
      Epic 12. These fixtures are scaffolding for that epic and a
      cross-check that today's stages stay schema-compatible with
      future model swaps.

## Epic 6 — Source research (Sonar Pro)

**Status: planned**
**Goal:** After a user locks the plan, the session enters `'research'`,
the runner expands per-section search hypotheses, fans out queries
through the search model (Sonar Pro), summarizes each hit with the fast
model, and persists candidates as `proposed` sources. The workbench
swaps to a review pane where the user accepts/rejects each candidate
and assigns it to a plan section. Identical queries within the same
session reuse prior hits without re-billing the search model. When the
user clicks "Finish research", the session transitions to `'drafting'`.
Eval fixtures are captured for the four new stages.

### Tasks

- [x] T-6-1: `sources` table schema + migration
      Goal: A user-scoped `sources` table backs the candidates produced
      by the research pipeline.
      Touches: `src/server/db/schema.ts`, `drizzle/0005_*.sql`,
      `drizzle/meta/*`.
      Acceptance:
        - Adds `sources` to `src/server/db/schema.ts` with columns:
          `id` (serial PK); `session_id` (integer NOT NULL, FK →
          `sessions.id` ON DELETE CASCADE); `section_id` (text, NULL);
          `hypothesis` (text NOT NULL); `query` (text NOT NULL);
          `url` (text NOT NULL); `title` (text NOT NULL);
          `raw_excerpt` (text NOT NULL); `summary` (text NOT NULL
          DEFAULT `''`); `relevance_score` (integer NOT NULL DEFAULT 0,
          intended range 0..100); `status` (text NOT NULL DEFAULT
          `'proposed'`, intended values `proposed|accepted|rejected`);
          `created_at` (timestamp DEFAULT `now()`).
        - A composite index on `(session_id, status)`.
        - A migration produced by `pnpm db:generate` lands at
          `drizzle/0005_*.sql` and creates the table + index. The
          drizzle meta journal is updated.
        - `pnpm db:migrate` against the compose DB applies cleanly and
          re-running is a no-op.
        - `pnpm typecheck` exits 0.
      Notes: `relevance_score` is stored as `integer 0..100` for stable
      ordering; the model emits 0..100 directly (see T-6-7). `status`
      is plain text — no Postgres enum; the Zod schemas in T-6-2 are
      the source of truth for allowed values.

- [x] T-6-2: Source / hypothesis / query Zod schemas
      Goal: Typed shapes for the outputs of the four research stages
      and for source rows.
      Touches: `src/server/sessions/sources.ts`,
      `tests/unit/sessions/sources-schema.test.ts`.
      Acceptance:
        - Exports `searchHypothesisSchema` (Zod): `id` (1..40,
          slug-like), `sectionId` (1..40, slug-like), `text` (1..400),
          `evidenceKind` (1..40 — free string, e.g. `statistic`,
          `expert_quote`, `case_study`).
        - Exports `searchQuerySchema`: `text` (1..200).
        - Exports `searchHitSchema`: `url` (`z.string().url()`),
          `title` (1..400), `snippet` (1..2000).
        - Exports `sourceSummarySchema`: `summary` (1..600),
          `relevanceScore` (`z.number().int().min(0).max(100)`).
        - Exports `sourceStatusSchema = z.enum(['proposed', 'accepted',
          'rejected'])`.
        - Exports `Hypothesis`, `SearchQuery`, `SearchHit`,
          `SourceSummary`, `SourceStatus` as `z.infer<...>` aliases.
        - Unit test asserts each schema accepts a valid hand-built
          value and fails on at least one obvious required-field
          violation per schema (e.g. malformed url, score = 150).
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-6-3: Sources repo helpers
      Goal: User-scoped persistence for source rows in the same
      cross-table-ownership style as the existing `sessions` repo.
      Touches: `src/server/sessions/sources-repo.ts`,
      `tests/unit/sessions/sources-repo.test.ts`.
      Acceptance:
        - Exports `insertSource(userId, sessionId, fields)` where
          `fields` is `{ sectionId: string | null; hypothesis: string;
          query: string; url: string; title: string; rawExcerpt: string;
          summary: string; relevanceScore: number }`. The helper first
          verifies that `sessions.id = sessionId AND
          sessions.user_id = userId`; if not, returns `null` (does not
          throw); otherwise inserts with `status = 'proposed'` and
          returns the inserted row.
        - Exports `listSessionSources(userId, sessionId)` returning
          rows ordered by `id ASC`, gated by the same ownership check
          (returns `[]` on non-owned).
        - Exports `findSourceByQuery(userId, sessionId, query)`
          returning all rows whose `query` column equals `query`
          exactly within the owned session — used by the cache in
          T-6-6.
        - Exports `setSourceStatus(userId, sourceId, status:
          SourceStatus)` and `setSourceSection(userId, sourceId,
          sectionId: string | null)`. Both update the row only when
          its session is owned by `userId` (a join/subquery on
          `sessions.user_id`); each returns the updated row or `null`.
        - Unit test mocks the drizzle client and asserts: each helper
          builds a `where` that includes the user-ownership predicate;
          the happy path returns the row; an unowned id resolves to
          `null`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-6-4: `plan_search_hypotheses` stage
      Goal: A `Stage` that reads the locked plan and the profile and
      emits 1..3 search hypotheses per section.
      Touches: `src/server/pipeline/stages/plan-search-hypotheses.ts`,
      `tests/unit/pipeline/plan-search-hypotheses.test.ts`.
      Acceptance:
        - Exports `planSearchHypotheses: Stage<{ plan: Plan; profile:
          ProfileRow }, { hypotheses: Hypothesis[] }>` named
          `'plan_search_hypotheses'`, model class `'smart'`.
        - `outputSchema` enforces `1 <= hypotheses.length <= 40` and
          each item conforms to `searchHypothesisSchema`. The stage
          additionally rejects (post-validate, in `run`) any hypothesis
          whose `sectionId` is not in `plan.sections[*].id` by throwing
          a typed `OrphanHypothesisError`.
        - `run` builds a system prompt naming the chosen methodology
          (read from the plan's section structure), the audience, and
          asking the model to produce hypotheses keyed to section ids;
          calls `routeJsonChat` with `class: 'smart'`; emits
          `task_started` and `task_completed` (`{ count }`) events.
        - Unit test stubs `routeJsonChat` to return three hypotheses
          across two sections; asserts the returned shape and event
          order. A stub returning a hypothesis with an unknown
          `sectionId` causes the stage to throw `OrphanHypothesisError`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-6-5: `formulate_queries` stage
      Goal: A `Stage` that converts a single hypothesis into 1..3
      concrete search queries, using the fast model.
      Touches: `src/server/pipeline/stages/formulate-queries.ts`,
      `tests/unit/pipeline/formulate-queries.test.ts`.
      Acceptance:
        - Exports `formulateQueries: Stage<{ hypothesis: Hypothesis },
          { queries: SearchQuery[] }>` named `'formulate_queries'`,
          model class `'fast'`.
        - `outputSchema` enforces `1 <= queries.length <= 3` and each
          query conforms to `searchQuerySchema`.
        - `run` calls `routeJsonChat` with `class: 'fast'`; emits
          `task_started` and `task_completed` (`{ count }`).
        - Unit test stubs `routeJsonChat` to return two queries;
          asserts the returned shape and event order. A stub returning
          zero queries causes the stage to throw via output-schema
          validation.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-6-6: `web_search` stage with within-session query cache
      Goal: A `Stage` that runs a single Sonar Pro query and returns
      structured hits, reusing prior in-session results when the same
      `query.text` was searched before.
      Touches: `src/server/llm/structured.ts`,
      `src/server/pipeline/stages/web-search.ts`,
      `tests/unit/pipeline/web-search.test.ts`.
      Acceptance:
        - `routeJsonChat` accepts `class?: 'smart' | 'fast' | 'search'`.
          When `class === 'search'`, it calls `routeSearch` instead of
          `routeChat` (still using `response_format: { type:
          'json_object' }`); on parse / schema failure it throws the
          existing `JsonChatParseError` / `JsonChatSchemaError`. All
          existing call sites still typecheck.
        - Exports `webSearch: Stage<{ sessionId: number; userId:
          number; hypothesis: Hypothesis; query: SearchQuery },
          { hits: SearchHit[]; cached: boolean }>` named `'web_search'`,
          model class `'search'`.
        - `run` first calls `findSourceByQuery(userId, sessionId,
          query.text)`; if it returns one or more rows, the stage
          reconstructs `hits` from those rows (`{ url, title, snippet:
          row.rawExcerpt }`), emits `task_completed` with
          `{ count, cached: true }`, and returns `{ hits, cached: true }`
          without an LLM call. On miss, it calls `routeJsonChat` with
          `class: 'search'` and a system prompt instructing JSON
          output `{ hits: [{ url, title, snippet }] }`, max 5 hits;
          validates against a Zod schema capping `hits.length` at 5;
          emits `task_completed` with `{ count, cached: false }`;
          returns `{ hits, cached: false }`.
        - Unit test stubs both `routeJsonChat` and `findSourceByQuery`
          and asserts: cache-hit path skips `routeJsonChat`, returns
          existing hits, and emits `cached: true`; cache-miss path
          calls `routeJsonChat` once and returns the parsed hits with
          `cached: false`.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Decision needed: should the search prompt include a domain
      allow/deny list? Default: no — leave to model; revisit if hits
      get spammy. Add a `// TODO: domain filtering` comment.

- [x] T-6-7: `summarize_source` stage
      Goal: A `Stage` that produces a 1–2 sentence summary and a
      0..100 relevance score for a single hit against its hypothesis,
      using the fast model.
      Touches: `src/server/pipeline/stages/summarize-source.ts`,
      `tests/unit/pipeline/summarize-source.test.ts`.
      Acceptance:
        - Exports `summarizeSource: Stage<{ hypothesis: Hypothesis;
          query: SearchQuery; hit: SearchHit }, SourceSummary>` named
          `'summarize_source'`, model class `'fast'`.
        - `outputSchema` is `sourceSummarySchema`. `run` builds a
          prompt containing the hypothesis text, the query text, and
          the hit (`url`, `title`, `snippet`); calls `routeJsonChat`
          with `class: 'fast'`; emits `task_started` and
          `task_completed` (`{ relevanceScore }`).
        - Unit test stubs `routeJsonChat` to return
          `{ summary: 's', relevanceScore: 73 }`; asserts the returned
          shape and event order. A stub returning `relevanceScore: 150`
          causes the stage to throw via output-schema validation.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-6-8: Runner — `'research'` state orchestration
      Goal: When the runner enters the `'research'` case it expands
      hypotheses, runs queries, summarizes hits, persists each as a
      `proposed` source, then parks waiting for the user to finish
      research before transitioning to `'drafting'`.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-research.test.ts`.
      Acceptance:
        - In the `'research'` case the runner: (a) loads `plan` from
          `session.plan` (validates via `planSchema`; emits
          `agent_message` and aborts on failure); loads the profile
          (same handling); (b) runs `planSearchHypotheses` and emits
          `artifact_updated` with `{ kind: 'hypotheses', hypotheses }`;
          (c) for each hypothesis sequentially: runs `formulateQueries`;
          for each resulting query sequentially: runs `webSearch`
          (passing `sessionId` + `userId` for cache lookup); for each
          hit sequentially: runs `summarizeSource`, then calls
          `insertSource(userId, sessionId, { sectionId:
          hypothesis.sectionId, hypothesis: hypothesis.text, query:
          query.text, url: hit.url, title: hit.title, rawExcerpt:
          hit.snippet, summary, relevanceScore })`. Each persisted row
          emits `artifact_updated` with `{ kind: 'source', source }`;
          (d) parks via `ctx.userInput('research_done',
          z.object({ action: z.literal('finish') }))`; (e) calls
          `updateSessionState(userId, sessionId, 'drafting')` and
          emits `state_changed` with `{ state: 'drafting' }`.
        - Unit test stubs the four stage modules and the sources-repo
          helpers; drives the runner with one hypothesis → one query
          → two hits; asserts: `insertSource` was called twice with
          the expected fields; the `artifact_updated` events were
          emitted in order (hypotheses, source, source); on the
          finish-park the runner advances state to `'drafting'`.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Decision needed: parallel vs sequential fan-out across queries
      and hits. Default: sequential — keeps SSE ordering deterministic
      and avoids hammering Sonar Pro / OpenRouter rate limits during
      v1. A `// TODO: parallelize once budgeting + rate limits land`
      comment marks the spot for revisit.

- [x] T-6-9: Source review server actions
      Goal: Server actions for accept / reject / section-assign per
      source, plus a `finishResearchAction` that releases the runner's
      `research_done` park.
      Touches: `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/sessions/source-actions.test.ts`.
      Acceptance:
        - Adds `acceptSourceAction(sessionId, sourceId)` and
          `rejectSourceAction(sessionId, sourceId)`: each calls
          `requireUser`, then `setSourceStatus(user.id, sourceId,
          'accepted'|'rejected')`, then
          `revalidatePath('/sessions/' + sessionId)`. Returns
          `{ ok: true }` on success or `{ ok: false, error:
          'not_found' }` when the repo returns `null`.
        - Adds `assignSourceSectionAction(sessionId, sourceId,
          sectionId)`: validates `sectionId` is a string (1..40 chars)
          or `null` via Zod; calls `setSourceSection`; same response
          shape and revalidate.
        - Adds `finishResearchAction(sessionId)`: calls `requireUser`,
          then `resolveUserInput(sessionId, { action: 'finish' })`;
          returns `{ ok: true }` if the call returned `true`,
          otherwise `{ ok: false, error: 'no_pending_research' }`.
        - Unit test mocks `requireUser`, the repo helpers, and
          `resolveUserInput`; asserts each action passes `user.id`
          through and that `finishResearchAction` invokes
          `resolveUserInput` exactly once with the expected payload.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-6-10: Workbench research UI — `<ResearchPane />`
      Goal: While `session.state === 'research'`, the workbench
      streams in proposed sources and lets the user triage them and
      finish research.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`,
      `src/app/(app)/sessions/[id]/research-pane.tsx`,
      `src/app/(app)/sessions/[id]/source-card.tsx`.
      Acceptance:
        - The session page mounts `<ResearchPane sessionId={id}
          initialSources={...} plan={session.plan} />` (a client
          component) when `state === 'research'`. `initialSources` is
          fetched server-side via `listSessionSources(user.id, id)`.
        - `ResearchPane` subscribes to the SSE stream (reusing the
          existing `useSessionEvents` hook) and on each
          `artifact_updated` with `payload.kind === 'source'` it
          adds or replaces the matching row in local state by id.
        - Each source renders as `<SourceCard>` showing url, title,
          summary, `relevanceScore`, and three controls: "Accept" /
          "Reject" buttons (calling the matching server actions) and
          a `<select>` listing the plan's section ids that calls
          `assignSourceSectionAction` on change. Status is reflected
          visually (accepted = green outline, rejected = grayed out).
        - A "Finish research" button is rendered at the bottom; it is
          disabled until at least one source has `status === 'accepted'`.
          Clicking it calls `finishResearchAction(sessionId)`; on
          `ok: true` the page rerenders and `state === 'drafting'`
          (the workbench shows the placeholder for now since drafting
          is Epic 7).
        - Manually verifiable via `pnpm dev` with `LLM_STUB=1`
          extended to also short-circuit the three new model-backed
          stages with canned fixtures (reuse the fixture files from
          T-6-11): submitting and locking a plan lands on the research
          pane with proposed sources streaming in.
        - `pnpm typecheck` and `pnpm lint` exit 0.
      Decision needed: should "Finish research" require ≥1 accepted
      source? Default: yes — empty drafting context produces poor
      drafts; the user can still reject everything and re-enter
      `'planning'` to widen the angle.

- [x] T-6-11: Eval fixtures for the four research stages
      Goal: Capture one input/expected snapshot per research stage so
      the Epic 12 harness can replay them.
      Touches: `tests/eval/fixtures/plan_search_hypotheses/habr-longread-1.json`,
      `tests/eval/fixtures/formulate_queries/habr-longread-1.json`,
      `tests/eval/fixtures/web_search/habr-longread-1.json`,
      `tests/eval/fixtures/summarize_source/habr-longread-1.json`,
      `tests/eval/README.md`.
      Acceptance:
        - Each fixture is a JSON file with shape `{ "input": {...},
          "expected": { "schemaRef": "<stage>.outputSchema",
          "snapshot": {...} } }`. Inputs reuse the Habr long-read
          plan/profile from Epic 5's fixtures so the chain is
          consistent.
        - `tests/eval/README.md` is updated to list the four new
          fixtures alongside the existing three.
        - One unit test per stage (added to the existing
          `tests/unit/pipeline/<stage>.test.ts` files from
          T-6-4..T-6-7) loads its fixture's `input`, runs the stage
          with a stub `routeJsonChat` returning `expected.snapshot`,
          and asserts the stage's return equals `expected.snapshot`.
        - `pnpm test` exits 0.
      Notes: No real LLM calls; the eval harness ships in Epic 12.
      These fixtures are scaffolding for that epic and a cross-check
      that today's stages stay schema-compatible with future model
      swaps.

---

## Epic 7 — Drafting + rewrite mode

**Status: planned**
**Goal:** When the user finishes research the session enters `'drafting'`,
the runner walks the locked plan section-by-section, calls a new
`draft_section` stage with the section spec + accepted sources for that
section + previously-drafted sections (windowed) + (in rewrite mode) the
brief's `sourceArticles`, and persists each section's markdown into a
new `section_drafts` table while keeping `sessions.draft_md` in sync as
the concatenation. The workbench swaps to a live drafting pane that
streams sections as they land and exposes a "Regenerate" control on
each (which re-runs `draft_section` for that section only with an
optional user instruction). When the user clicks "Finish drafting", the
session transitions to `'review'`. An eval fixture for `draft_section`
is captured.

### Tasks

- [x] T-7-1: `section_drafts` table schema + migration
      Goal: A user-scoped `section_drafts` table backs the per-section
      markdown produced by the drafting pipeline.
      Touches: `src/server/db/schema.ts`, `drizzle/0007_*.sql`,
      `drizzle/meta/*`.
      Acceptance:
        - Adds `sectionDrafts` to `src/server/db/schema.ts` with
          columns: `id` (serial PK); `session_id` (integer NOT NULL,
          FK → `sessions.id` ON DELETE CASCADE); `section_id` (text
          NOT NULL); `content_md` (text NOT NULL DEFAULT `''`);
          `created_at` (timestamp DEFAULT `now()`); `updated_at`
          (timestamp DEFAULT `now()`).
        - A unique index on `(session_id, section_id)` so the runner
          can upsert by section.
        - A migration produced by `pnpm db:generate` lands at
          `drizzle/0007_*.sql` and creates the table + index. The
          drizzle meta journal is updated.
        - `pnpm db:migrate` against the compose DB applies cleanly
          and re-running is a no-op.
        - `pnpm typecheck` exits 0.
      Notes: `content_md` is stored verbatim — no enum or extra
      validation at the DB layer; Zod schemas in T-7-3 are the source
      of truth for allowed lengths.

- [x] T-7-2: Section-drafts repo helpers
      Goal: User-scoped persistence for section-draft rows in the same
      cross-table-ownership style as the existing `sources-repo`.
      Touches: `src/server/sessions/section-drafts-repo.ts`,
      `tests/unit/sessions/section-drafts-repo.test.ts`.
      Acceptance:
        - Exports `upsertSectionDraft(userId, sessionId, sectionId,
          contentMd)` which first verifies that `sessions.id =
          sessionId AND sessions.user_id = userId`; if not, returns
          `null` (does not throw). Otherwise performs an upsert keyed
          on `(session_id, section_id)` (`onConflictDoUpdate` setting
          `content_md` and `updated_at = now()`) and returns the
          inserted/updated row.
        - Exports `listSectionDrafts(userId, sessionId)` returning rows
          ordered by `id ASC`, gated by the same ownership check
          (returns `[]` on non-owned).
        - Exports `getSectionDraft(userId, sessionId, sectionId)`
          returning the matching row or `null`, gated by ownership.
        - Unit test mocks the drizzle client and asserts: each helper
          builds a `where` that includes the user-ownership predicate;
          the happy path returns the row; an unowned id resolves to
          `null` / `[]` as appropriate.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-7-3: Draft Zod schemas
      Goal: Typed shapes for the `draft_section` stage output and for
      regenerate instructions.
      Touches: `src/server/sessions/draft.ts`,
      `tests/unit/sessions/draft-schema.test.ts`.
      Acceptance:
        - Exports `sectionDraftOutputSchema` (Zod):
          `contentMd: z.string().min(1).max(40000)`.
        - Exports `regenerateInstructionSchema = z.string().min(1)
          .max(1000)`.
        - Exports `SectionDraftOutput` and `RegenerateInstruction` as
          `z.infer<...>` aliases.
        - Unit test asserts each schema accepts a valid hand-built
          value and fails on at least one obvious violation
          (empty `contentMd`, instruction longer than 1000 chars).
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-7-4: `draft_section` stage
      Goal: A `Stage` that writes the markdown body for a single
      section, given the profile, the locked plan, the section spec,
      the accepted sources for that section, the previously-drafted
      sections (windowed), an optional rewrite instruction, and (in
      rewrite mode) the brief's `sourceArticles`.
      Touches: `src/server/pipeline/stages/draft-section.ts`,
      `tests/unit/pipeline/draft-section.test.ts`.
      Acceptance:
        - Exports `draftSection: Stage<{ profile: ProfileRow; plan:
          Plan; section: PlanSection; acceptedSources: Array<{ url:
          string; title: string; summary: string; rawExcerpt: string
          }>; prevSections: Array<{ id: string; contentMd: string }>;
          instruction?: string; rewriteSourceArticles?:
          SourceArticle[] }, SectionDraftOutput>` named
          `'draft_section'`, model class `'smart'`.
        - `outputSchema` is `sectionDraftOutputSchema`.
        - `run` builds a system prompt naming the platform name +
          format, audience, style, the chosen methodology (read from
          the plan's section structure / angle echo on the plan), the
          target word count for the section (from
          `section.expectedLength`), and the markup convention
          (markdown). It builds a user prompt that includes: the
          section title + intent + key points; a list of accepted
          sources (`title — url — summary`); the previously drafted
          sections concatenated as `## prevTitle\n<body>`; if
          `rewriteSourceArticles` is non-empty, a "Rewrite source"
          block listing each `(url, content)` and an instruction to
          base the section on this material applying the new profile +
          methodology; if `instruction` is non-empty, an "Override
          instruction" block telling the model to apply that
          instruction to this regeneration.
        - `run` calls `routeJsonChat` with `class: 'smart'` and a
          system instruction to respond ONLY with valid JSON
          `{ "contentMd": "..." }`. Emits `task_started` (`{ stage,
          sectionId }`) and `task_completed` (`{ stage, sectionId,
          length: contentMd.length }`).
        - Unit test stubs `routeJsonChat` to return
          `{ contentMd: '## Hook\n…' }` and asserts: returned shape;
          event order; system prompt mentions the section title and
          the platform; user prompt mentions an accepted source url.
          A second test passes `instruction: 'Tighten the intro'` and
          a non-empty `rewriteSourceArticles` and asserts both blocks
          appear in the user prompt.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Decision needed: should previous sections be passed verbatim or
      summarized? Default: verbatim — matches FR-DRAFT-1 ("previous
      sections (windowed)") and avoids a second model call. A
      `// TODO: window prev sections by token budget` comment marks
      where to revisit once we have token-aware windowing.

- [x] T-7-5: `updateSessionDraft` repo helper
      Goal: Persist the concatenated `draft_md` text on
      `sessions.draft_md` whenever the runner finishes (or
      regenerates) a section.
      Touches: `src/server/sessions/repo.ts`,
      `tests/unit/sessions/repo.test.ts`.
      Acceptance:
        - Exports `updateSessionDraft(userId, id, draftMd: string)`
          mirroring the existing `updateSessionPlan` (ownership
          check, returns the updated row or `null`, sets
          `updated_at = new Date()`).
        - Existing `repo.test.ts` (or a new sibling test) asserts the
          helper writes `draft_md` and respects the user-ownership
          predicate.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-7-6: Runner — `'drafting'` state orchestration
      Goal: When the runner enters the `'drafting'` case it walks the
      plan sections sequentially, calls `draftSection.run` on each,
      upserts the resulting markdown into `section_drafts`, refreshes
      `sessions.draft_md`, then parks waiting for the user to finish
      drafting before transitioning to `'review'`.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-drafting.test.ts`.
      Acceptance:
        - In the `'drafting'` case the runner: (a) loads `plan` from
          `session.plan` (validates via `planSchema`; emits
          `agent_message` with `error: true` and aborts on failure);
          loads `brief` from `session.brief` (same handling); loads
          the profile (same handling); (b) loads accepted sources via
          `listSessionSources(userId, sessionId)` filtered to
          `status === 'accepted'`; (c) for each `section` in
          `plan.sections` sequentially: builds
          `acceptedSources = sources.filter(s => s.sectionId ===
          section.id)`, builds `prevSections` from the in-memory
          accumulator of already-drafted sections; calls
          `draftSection.run({ profile, plan, section, acceptedSources,
          prevSections, rewriteSourceArticles: session.mode ===
          'rewrite' ? brief.sourceArticles : undefined })`; calls
          `upsertSectionDraft(userId, sessionId, section.id,
          contentMd)`; pushes `{ id: section.id, contentMd }` onto
          the accumulator; computes the new `draft_md` as the
          accumulator joined with `\n\n` and calls
          `updateSessionDraft(userId, sessionId, draftMd)`; emits
          `artifact_updated` with `{ kind: 'section_draft', sectionId:
          section.id, contentMd }`; (d) parks via
          `ctx.userInput('draft_done', z.object({ action:
          z.literal('finish') }))`; (e) calls
          `updateSessionState(userId, sessionId, 'review')` and emits
          `state_changed` with `{ state: 'review' }`.
        - Unit test stubs the new stage module, the section-drafts
          repo, the sources repo, and `updateSessionDraft`; drives
          the runner with a two-section plan and one accepted source
          attached to section 1; asserts: `draftSection.run` was
          called twice in section order; the second call received
          the first section's contentMd in `prevSections`;
          `upsertSectionDraft` was called twice; the
          `artifact_updated` events were emitted in order
          (`section_draft`, `section_draft`); on finish-park the
          runner advances state to `'review'`. A second test runs the
          session with `mode: 'rewrite'` and asserts the stage
          received `rewriteSourceArticles` populated from
          `brief.sourceArticles`.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Decision needed: parallel vs sequential fan-out across
      sections. Default: sequential — required so each section sees
      the previous ones as `prevSections` context. A `// TODO:
      consider parallel drafting with a second pass for cohesion`
      comment marks the spot for future revisit.

- [x] T-7-7: `regenerateSection` helper + server actions
      Goal: A non-runner code path for re-drafting a single section
      with an optional user instruction (used while parked at
      `draft_done`), and the matching server actions.
      Touches: `src/server/pipeline/regenerate-section.ts`,
      `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/pipeline/regenerate-section.test.ts`,
      `tests/unit/sessions/draft-actions.test.ts`.
      Acceptance:
        - `regenerate-section.ts` exports `regenerateSection({
          sessionId, userId, sectionId, instruction })` that: loads
          session/profile/brief; loads accepted sources; locates
          `section` in `plan.sections` (returns
          `{ ok: false, error: 'section_not_found' }` if missing);
          loads previously-drafted sections via
          `listSectionDrafts(userId, sessionId)` and uses everything
          *before* `section.id` in plan order as `prevSections`; calls
          `draftSection.run({ ..., instruction,
          rewriteSourceArticles: session.mode === 'rewrite' ?
          brief.sourceArticles : undefined })`; calls
          `upsertSectionDraft`; recomputes the full `draft_md` from
          the now-current section drafts (in plan order) and calls
          `updateSessionDraft`; emits `artifact_updated` with
          `{ kind: 'section_draft', sectionId, contentMd }`; returns
          `{ ok: true, contentMd }`.
        - `actions.ts` adds `regenerateSectionAction(sessionId:
          number, sectionId: unknown, instruction: unknown)`:
          `requireUser`; validates `sectionId` via
          `z.string().min(1).max(40)` and `instruction` via
          `regenerateInstructionSchema.optional().or(z.literal(''))`;
          calls `regenerateSection`; returns its result; calls
          `revalidatePath('/sessions/' + sessionId)` on success.
        - `actions.ts` adds `finishDraftAction(sessionId: number)`
          (parallel to `finishResearchAction`): calls `requireUser`,
          then `resolveUserInput(sessionId, { action: 'finish' })`;
          returns `{ ok: true }` if the call returned `true`,
          otherwise `{ ok: false, error: 'no_pending_draft' }`.
        - Unit tests: one for `regenerateSection` (stubs
          `draftSection.run`, the repos, and the bus; asserts the
          stage receives `prevSections` containing only sections
          before the target in plan order, `instruction` is passed
          through, and the new `draft_md` reflects the regenerated
          section in its plan position); one for the actions (mocks
          `requireUser`, `regenerateSection`, and `resolveUserInput`;
          asserts each action passes `user.id` through and that
          validation rejects an instruction longer than 1000 chars
          with `{ ok: false, error: 'validation' }`).
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-7-8: Workbench drafting UI — `<DraftingPane />`
      Goal: While `session.state === 'drafting'`, the workbench
      streams in section drafts as they land, exposes a "Regenerate"
      control per section (with an optional instruction textarea),
      and a "Finish drafting" button that releases the runner's
      `draft_done` park.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`,
      `src/app/(app)/sessions/[id]/drafting-pane.tsx`,
      `src/app/(app)/sessions/[id]/section-card.tsx`.
      Acceptance:
        - `page.tsx` mounts `<DraftingPane sessionId={id}
          plan={plan} initialSections={await
          listSectionDrafts(user.id, id)} />` (a client component)
          when `state === 'drafting'`. The plan is parsed via
          `planSchema` server-side and only rendered when valid.
        - `drafting-pane.tsx` keeps a local `Map<sectionId,
          contentMd>` seeded from `initialSections`. It subscribes to
          the SSE stream (reusing `useSessionEvents`) and on each
          `artifact_updated` with `payload.kind === 'section_draft'`
          it replaces the map entry by `sectionId`. It tracks an
          `awaitingFinish` flag flipped on by `awaiting_user` with
          `prompt === 'draft_done'`.
        - For each section in plan order it renders
          `<SectionCard plan={plan} section={section}
          contentMd={map.get(section.id) ?? null}
          sessionId={sessionId} />`. The card shows the section title
          + intent, the rendered markdown in a `<pre>` (no markdown
          library required for v1), a collapsible "Regenerate"
          panel with an `<textarea name="instruction" maxLength=
          {1000}>` and a button calling
          `regenerateSectionAction(sessionId, section.id,
          instruction || '')`; busy state disables the button.
        - A "Finish drafting" button is rendered at the bottom; it
          is disabled until every plan section has a non-null
          `contentMd` AND `awaitingFinish` is true. Clicking it calls
          `finishDraftAction(sessionId)`; on `ok: true` the page
          rerenders and `state === 'review'` (the workbench shows
          the placeholder for now since review is Epic 8).
        - `pnpm typecheck` and `pnpm lint` exit 0.
      Decision needed: should "Finish drafting" require every plan
      section to be drafted? Default: yes — partial drafts are not
      reviewable; the user can regenerate any unsatisfactory section
      first. The UI surfaces a hint when blocked.

- [x] T-7-9: Eval fixture for `draft_section`
      Goal: Capture one input/expected snapshot for `draft_section`
      so the Epic 12 harness can replay it.
      Touches: `tests/eval/fixtures/draft_section/habr-longread-1.json`,
      `tests/eval/README.md`,
      `tests/unit/pipeline/draft-section.test.ts`.
      Acceptance:
        - The fixture is a JSON file with shape `{ "input": {...},
          "expected": { "schemaRef": "draftSection.outputSchema",
          "snapshot": { "contentMd": "..." } } }`. The input reuses
          the Habr long-read profile + plan from Epic 5's fixtures
          and uses the first plan section as `section`, with one
          accepted source taken from the existing
          `summarize_source` fixture.
        - `tests/eval/README.md` is updated to list the new fixture
          alongside the existing eight (add a `draftSection` row to
          the table).
        - The existing `draft-section.test.ts` (from T-7-4) gets one
          additional test that loads the fixture's `input`, runs the
          stage with a stub `routeJsonChat` returning
          `expected.snapshot`, and asserts the stage's return equals
          `expected.snapshot`.
        - `pnpm test` exits 0.
      Notes: No real LLM calls; the eval harness ships in Epic 12.

---

## Epic 8 — Review: critics + fact-checker

**Status: shipped (T-8-1 … T-8-18 complete; redesigned post-T-8-18)**

> **Post-shipping redesign (commit `b0ccb78`):** the parallel-critics
> design from T-8-6/T-8-7 was replaced with a single strong-model
> review call composing selected lenses, plus a new `apply-revisions`
> stage that rewrites the full draft from filtered findings. Per-finding
> actions from T-8-8 (`dismiss/apply/rewriteFromFinding`) and the
> custom-critic UI were removed; severity is now `critical/medium/minor`
> with a deterministic critical+medium rewrite gate, minor stays
> informational. Two new `sessions` columns
> (`revised_draft_md`, `revision_status`) hold the pending revision; the
> review UI gained a 3-column "before / after / applied comments" screen.
> The `run_critic` stage was deleted; `run_review` is now the canonical
> stage with its own eval fixture (replacing `run_critic/`). Original
> task acceptance criteria below describe the pre-redesign shape; treat
> them as historical context for the directories touched, not as the
> current contract. Drafting also gained resilience (resumable on
> crash, runner lock, fallback on null LLM content) shipped in the
> same commit.

**Goal:** When the user finishes drafting the session enters
`'review'`. The workbench swaps to a two-tab review pane. The
**Critique** tab lets the user run a panel of critic personas
(built-ins + ad-hoc custom critics) in parallel against the locked
draft; each round persists as a `critique_round` row with N
`critique_findings`. Per-finding actions (dismiss / apply verbatim /
send to drafter for a section-scoped rewrite) keep critics as judges
only — the drafting agent stays the sole writer to `draft_md`. The
**Fact-check** tab lets the user run the three-stage pipeline
(`extract_claims` → `verify_claim` → `adjudicate_claim`); claims and
verdicts persist with `span_hash` idempotency so repeat runs skip
unchanged spans unless forced. When the user clicks "Finish review",
the session transitions to `'decoration'`. Eval fixtures are captured
for the four new stages.

### Tasks

- [x] T-8-1: Review subsystem DB schema + migration
      Goal: Five new tables back the review subsystem —
      `critique_rounds`, `critique_findings`, `claims`,
      `claim_verdicts`, `claim_evidence`.
      Touches: `src/server/db/schema.ts`, `drizzle/0009_*.sql`,
      `drizzle/meta/*`.
      Acceptance:
        - Adds the five tables to `src/server/db/schema.ts` with the
          following columns:
          - `critiqueRounds`: `id` (serial PK); `session_id` (integer
            NOT NULL, FK → `sessions.id` ON DELETE CASCADE); `kind`
            (text NOT NULL, intended values `critique|factcheck`);
            `draft_hash` (text NOT NULL); `created_at` (timestamp
            DEFAULT `now()` NOT NULL). Index on `(session_id, id)`.
          - `critiqueFindings`: `id` (serial PK); `round_id` (integer
            NOT NULL, FK → `critique_rounds.id` ON DELETE CASCADE);
            `critic_id` (text NOT NULL); `severity` (text NOT NULL,
            intended `info|minor|major`); `span` (jsonb NOT NULL);
            `problem` (text NOT NULL); `suggested_change` (text NOT
            NULL); `rationale` (text NOT NULL); `status` (text NOT
            NULL DEFAULT `'open'`, intended
            `open|dismissed|applied|rewritten`); `created_at`
            (timestamp DEFAULT `now()` NOT NULL). Index on
            `(round_id, id)`.
          - `claims`: `id` (serial PK); `session_id` (integer NOT
            NULL, FK → `sessions.id` ON DELETE CASCADE); `round_id`
            (integer NOT NULL, FK → `critique_rounds.id` ON DELETE
            CASCADE); `span` (jsonb NOT NULL); `span_hash` (text NOT
            NULL); `claim_text` (text NOT NULL); `claim_type` (text
            NOT NULL); `check_worthiness` (text NOT NULL); `status`
            (text NOT NULL DEFAULT `'open'`, intended
            `open|opinion|dismissed`); `created_at` (timestamp
            DEFAULT `now()` NOT NULL). Index on `(session_id,
            span_hash)`.
          - `claimVerdicts`: `id` (serial PK); `claim_id` (integer
            NOT NULL, FK → `claims.id` ON DELETE CASCADE); `verdict`
            (text NOT NULL, intended
            `verified|contradicted|unverifiable|needs_caveat`);
            `justification` (text NOT NULL); `created_at` (timestamp
            DEFAULT `now()` NOT NULL). Index on `(claim_id, id)`.
          - `claimEvidence`: `id` (serial PK); `verdict_id` (integer
            NOT NULL, FK → `claim_verdicts.id` ON DELETE CASCADE);
            `source_id` (integer NULL, FK → `sources.id` ON DELETE
            SET NULL); `url` (text NOT NULL); `snippet` (text NOT
            NULL); `supports` (boolean NOT NULL); `created_at`
            (timestamp DEFAULT `now()` NOT NULL).
        - A migration produced by `pnpm db:generate` lands at
          `drizzle/0009_*.sql` and creates the five tables + indexes.
          The drizzle meta journal is updated.
        - `pnpm db:migrate` against the compose DB applies cleanly
          and re-running is a no-op.
        - `pnpm typecheck` exits 0.
      Notes: enums are stored as plain `text` for consistency with
      the existing schema (sources, sessions); the Zod schemas in
      T-8-2 / T-8-3 are the source of truth for allowed values.

- [x] T-8-2: Critic + Finding + active-critics schemas + built-in
      critic registry
      Goal: Typed shapes for critics, findings, and the
      session-scoped active-critics config, plus the built-in critic
      registry data (with system prompts).
      Touches: `src/server/sessions/critics.ts`,
      `tests/unit/sessions/critics-schema.test.ts`.
      Acceptance:
        - Exports `severitySchema = z.enum(['info', 'minor',
          'major'])`.
        - Exports `findingSpanSchema`: `{ sectionId: z.string()
          .min(1).max(120), charStart: z.number().int().min(0),
          charEnd: z.number().int().min(0) }` (no constraint that
          end >= start at the schema level — the model can emit
          out-of-order; the runner clamps).
        - Exports `findingSchema`: `{ criticId: z.string().min(1)
          .max(60), severity: severitySchema, span: findingSpanSchema,
          problem: z.string().min(1).max(2000), suggestedChange:
          z.string().min(1).max(2000), rationale: z.string().min(1)
          .max(2000) }`.
        - Exports `findingsResponseSchema = z.object({ findings:
          z.array(findingSchema).max(20) })`.
        - Exports `criticDefSchema`: `{ id, label, systemPrompt,
          defaultEnabled }` (all string fields with sensible bounds).
        - Exports `activeCriticsSchema = z.object({ enabledIds:
          z.array(z.string().min(1).max(60)).default([]), custom:
          z.array(z.object({ id: z.string().min(1).max(60), label:
          z.string().min(1).max(120), promptFragment: z.string()
          .min(1).max(4000) })).default([]) })` with helper
          `parseActiveCritics(value: unknown): ActiveCritics` that
          falls back to `{ enabledIds: BUILTIN_DEFAULTS, custom: [] }`
          when the column is null.
        - Exports the built-in registry `BUILTIN_CRITICS:
          readonly CriticDef[]` with one entry per spec critic
          (`editorial`, `audience_fit`, `methodology`, `style`,
          `structure`, `headline`, `seo_discoverability`); each
          entry's `systemPrompt` is a 2–6-line persona block ending
          with the rule "respond ONLY with valid JSON of shape
          `{ findings: [...] }`". `defaultEnabled` is `true` for all
          built-ins.
        - Exports the constant `BUILTIN_DEFAULTS: string[]` listing
          the built-in critic ids that are enabled by default.
        - Exports `Severity`, `FindingSpan`, `Finding`,
          `FindingsResponse`, `CriticDef`, `ActiveCritics` as
          `z.infer<...>` aliases.
        - Unit test asserts each schema accepts a valid hand-built
          value and fails on at least one obvious violation per
          schema (severity = `'fatal'`, problem = empty); asserts
          `BUILTIN_CRITICS.length === 7` and that every built-in id
          appears in `BUILTIN_DEFAULTS`; asserts `parseActiveCritics(null)`
          returns the defaults.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-8-3: Claim + verdict + evidence schemas + spanHash helper
      Goal: Typed shapes for the three fact-check stages plus the
      span-hash idempotency helper.
      Touches: `src/server/sessions/claims.ts`,
      `tests/unit/sessions/claims-schema.test.ts`.
      Acceptance:
        - Exports `claimTypeSchema = z.enum(['statistic',
          'named_entity', 'event', 'attribution', 'definition',
          'other'])`.
        - Exports `checkWorthinessSchema = z.enum(['low', 'medium',
          'high'])`.
        - Exports `verdictSchema = z.enum(['verified',
          'contradicted', 'unverifiable', 'needs_caveat'])`.
        - Exports `claimSpanSchema`: `{ sectionId: z.string().min(1)
          .max(120), charStart: z.number().int().min(0), charEnd:
          z.number().int().min(0), text: z.string().min(1).max(2000) }`.
        - Exports `claimSchema`: `{ span: claimSpanSchema, claimType:
          claimTypeSchema, checkWorthiness: checkWorthinessSchema }`.
        - Exports `claimsResponseSchema = z.object({ claims:
          z.array(claimSchema).max(60) })`.
        - Exports `evidenceItemSchema`: `{ url: z.string().url(),
          snippet: z.string().min(1).max(2000), supports: z.boolean() }`.
        - Exports `evidenceResponseSchema = z.object({ evidence:
          z.array(evidenceItemSchema).max(8) })`.
        - Exports `adjudicationSchema`: `{ verdict: verdictSchema,
          justification: z.string().min(1).max(1000), citationUrls:
          z.array(z.string().url()).max(8) }`.
        - Exports `spanHash(text: string): string` that returns
          `sha256(text)` as a lower-hex string using `node:crypto`'s
          `createHash`.
        - Exports `ClaimType`, `CheckWorthiness`, `Verdict`,
          `ClaimSpan`, `Claim`, `ClaimsResponse`, `EvidenceItem`,
          `EvidenceResponse`, `Adjudication` as `z.infer<...>`
          aliases.
        - Unit test asserts each schema accepts a valid hand-built
          value and fails on at least one obvious violation per
          schema (claim type = `'rumor'`, verdict = `'maybe'`,
          malformed evidence url); asserts `spanHash('hello') ===
          spanHash('hello')` and `spanHash('hello') !==
          spanHash('Hello')`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-8-4: Critique repo helpers
      Goal: User-scoped persistence for critique rounds and findings
      in the same cross-table-ownership style as the existing
      `sources-repo`.
      Touches: `src/server/sessions/critique-repo.ts`,
      `tests/unit/sessions/critique-repo.test.ts`.
      Acceptance:
        - Exports `createCritiqueRound(userId, sessionId, kind:
          'critique' | 'factcheck', draftHash: string)` which first
          verifies the session is owned by `userId`; returns `null`
          on non-owned, otherwise inserts and returns the new row.
        - Exports `insertFinding(userId, roundId, fields:
          { criticId, severity, span, problem, suggestedChange,
          rationale })` which verifies (via a join) that
          `roundId` belongs to a session owned by `userId`; returns
          `null` on non-owned, otherwise inserts with
          `status = 'open'` and returns the new row.
        - Exports `listSessionRounds(userId, sessionId, kind?:
          'critique' | 'factcheck')` returning rounds ordered by
          `id ASC`, gated by ownership (returns `[]` on non-owned).
        - Exports `listRoundFindings(userId, roundId)` returning
          findings ordered by `id ASC`, gated by ownership
          (returns `[]` on non-owned).
        - Exports `setFindingStatus(userId, findingId, status:
          'open' | 'dismissed' | 'applied' | 'rewritten')` which
          updates only when the finding's round's session is owned;
          returns the updated row or `null`.
        - Unit test mocks the drizzle client and asserts: each
          helper builds a `where` that includes the user-ownership
          predicate; the happy path returns the row; an unowned id
          resolves to `null` / `[]` as appropriate.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-8-5: Claims repo helpers
      Goal: User-scoped persistence for claims, verdicts, and
      evidence, plus the span-hash idempotency lookup.
      Touches: `src/server/sessions/claims-repo.ts`,
      `tests/unit/sessions/claims-repo.test.ts`.
      Acceptance:
        - Exports `insertClaim(userId, sessionId, roundId, fields:
          { span, spanHash, claimText, claimType, checkWorthiness })`
          gated by session-ownership; returns the new row with
          `status = 'open'` or `null` when not owned.
        - Exports `listSessionClaims(userId, sessionId)` returning
          claims ordered by `id ASC`, gated by ownership.
        - Exports `findClaimBySpanHash(userId, sessionId, spanHash:
          string)` returning the most recent claim with that hash
          (and its current verdict via a left join, or `null` if
          none); used for idempotency.
        - Exports `setClaimStatus(userId, claimId, status: 'open' |
          'opinion' | 'dismissed')` gated by ownership.
        - Exports `insertClaimVerdict(userId, claimId, fields:
          { verdict, justification })` gated by ownership; returns
          new row or `null`.
        - Exports `insertClaimEvidence(userId, verdictId, items:
          Array<{ sourceId: number | null; url; snippet;
          supports }>)` gated by ownership; returns the inserted
          rows.
        - Exports `listClaimVerdicts(userId, claimId)` returning
          verdicts ordered by `id ASC` plus their evidence rows
          inlined (`{ ...verdict, evidence: ClaimEvidenceRow[] }`).
        - Unit test mocks the drizzle client and asserts each
          helper builds a `where` that includes the user-ownership
          predicate; the happy path returns the row; unowned ids
          resolve to `null` / `[]`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-8-6: `run_critic` stage
      Goal: A `Stage` that runs one critic persona over the draft
      and returns typed `Finding[]`.
      Touches: `src/server/pipeline/stages/run-critic.ts`,
      `tests/unit/pipeline/run-critic.test.ts`.
      Acceptance:
        - Exports `runCritic: Stage<{ critic: CriticDef; plan: Plan;
          profile: ProfileRow; sectionDrafts: Array<{ sectionId:
          string; contentMd: string }> }, FindingsResponse>` named
          `'run_critic'`, model class `'smart'`.
        - `outputSchema` is `findingsResponseSchema`.
        - `run` builds the system prompt by concatenating
          `critic.systemPrompt` with: the platform name, audience,
          and style from the profile; the chosen methodology and
          thesis from the plan; the rule "respond ONLY with valid
          JSON of shape `{ findings: [...] }`, no prose, no fences".
          The user prompt lists each section as `## <title>
          [sectionId=<id>]\n<contentMd>`.
        - `run` calls `routeJsonChat` with `class: 'smart'` and
          `schema: findingsResponseSchema`; emits `task_started`
          (`{ stage: 'run_critic', criticId }`) and
          `task_completed` (`{ stage: 'run_critic', criticId,
          count: findings.length }`).
        - Findings whose `span.sectionId` is not in `plan.sections[*].id`
          are dropped silently before returning (the model's outputs
          aren't always perfectly grounded; we don't fail the run on
          one bad span).
        - Unit test stubs `routeJsonChat` to return two findings
          (one valid, one with an unknown `sectionId`); asserts the
          returned shape contains exactly the valid finding, the
          system prompt mentions the critic's `systemPrompt` and the
          plan's thesis, and `task_started` / `task_completed`
          events were emitted in order with the expected payloads.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-8-7: `runReview` orchestration helper + `startReviewAction`
      Goal: A non-runner code path that, on user request, creates a
      new `'critique'` round, fans out the session's active critics
      in parallel, and persists each critic's findings.
      Touches: `src/server/pipeline/run-review.ts`,
      `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/pipeline/run-review.test.ts`,
      `tests/unit/sessions/start-review-action.test.ts`.
      Acceptance:
        - `run-review.ts` exports `runReview({ sessionId, userId })`
          that: loads session, profile, plan (validates each via
          its schema; returns `{ ok: false, error: 'session_invalid' }`
          on missing/invalid); short-circuits with
          `{ ok: false, error: 'no_draft' }` if `session.draftMd` is
          empty; resolves the active critic list by calling
          `parseActiveCritics(session.activeCritics)` and combining
          built-ins from `BUILTIN_CRITICS` (filtered by
          `enabledIds`) with custom critics (custom critic
          `systemPrompt` is `GENERIC_CRITIC_SYSTEM_PROMPT + '\n' +
          c.promptFragment`, where `GENERIC_CRITIC_SYSTEM_PROMPT` is
          a constant exported from this file); creates a
          `critique_round` via `createCritiqueRound(userId,
          sessionId, 'critique', spanHash(session.draftMd))`; loads
          all section drafts via `listSectionDrafts`; runs
          `runCritic.run({ critic, plan, profile, sectionDrafts })`
          for every active critic in parallel via `Promise.all`;
          for each returned finding calls `insertFinding(userId,
          round.id, ...)`; emits one `artifact_updated` per persisted
          finding (`{ kind: 'finding', finding }`) and one final
          `artifact_updated` (`{ kind: 'critique_round', roundId:
          round.id, findingCount }`); returns `{ ok: true, roundId,
          findingCount }`.
        - `actions.ts` adds `startReviewAction(sessionId: number)`:
          calls `requireUser`, calls `runReview`, returns its result
          unchanged. `revalidatePath('/sessions/' + sessionId)` on
          `ok: true`.
        - Unit test for `runReview` stubs `runCritic.run`, the
          repos, and the bus; configures a session with two
          built-ins enabled and one custom critic; drives the
          helper; asserts: `runCritic.run` was called three times in
          parallel; each persisted finding hit `insertFinding`; the
          final `artifact_updated` event carries the right
          `findingCount`. A second test asserts `no_draft` short-
          circuit when `draftMd` is empty.
        - Unit test for the action mocks `requireUser` and
          `runReview`, asserts `user.id` is passed through.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.
      Decision needed: should the orchestration emit per-critic
      progress (`task_started: editorial`) for the chat pane?
      Default: yes — `runCritic.run` already emits these via its
      `ctx`, so the chat reflects live critic progress. No extra
      code in the orchestrator.

- [x] T-8-8: Per-finding action server actions
      Goal: Server actions for dismiss / apply verbatim / send-to-
      drafter on a single finding.
      Touches: `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/sessions/finding-actions.test.ts`.
      Acceptance:
        - Adds `dismissFindingAction(sessionId, findingId)`: calls
          `requireUser`, then `setFindingStatus(user.id, findingId,
          'dismissed')`, then `revalidatePath`. Returns `{ ok: true }`
          or `{ ok: false, error: 'not_found' }`.
        - Adds `applyFindingAction(sessionId, findingId)`: calls
          `requireUser`, then `setFindingStatus(user.id, findingId,
          'applied')`. v1 is "mark as applied" only — applying the
          actual span change is the user's job (they can copy the
          `suggested_change` text into the section); the comment
          `// TODO: optionally route through regenerateSection for
          surgical edit` is left in.
        - Adds `rewriteFromFindingAction(sessionId, findingId)`:
          calls `requireUser`; loads the finding (helper:
          `getFindingForUser(userId, findingId)` added in
          critique-repo); if missing returns
          `{ ok: false, error: 'not_found' }`; calls
          `regenerateSection({ sessionId, userId, sectionId:
          finding.span.sectionId, instruction: '[critic
          ' + finding.criticId + '] ' + finding.problem + ' — ' +
          finding.suggestedChange })`; on success calls
          `setFindingStatus(user.id, findingId, 'rewritten')`.
          Returns the regenerate-section result shape passthrough.
        - Unit test mocks `requireUser`, the repo helpers, and
          `regenerateSection`; asserts each action passes `user.id`
          through; asserts `rewriteFromFindingAction` builds the
          instruction string with the critic id + problem +
          suggestion and updates status to `'rewritten'` after a
          successful regenerate.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.
      Decision needed: should "apply verbatim" perform the actual
      span replacement automatically? Default: no — span-level
      Markdown replacement is brittle when the model's char offsets
      are approximate. v1 marks as applied; v2 can add surgical
      replace once spans are anchor-stable.

- [x] T-8-9: `extract_claims` stage
      Goal: A `Stage` that extracts factual claims from the draft
      with span info and check-worthiness.
      Touches: `src/server/pipeline/stages/extract-claims.ts`,
      `tests/unit/pipeline/extract-claims.test.ts`.
      Acceptance:
        - Exports `extractClaims: Stage<{ plan: Plan; sectionDrafts:
          Array<{ sectionId: string; contentMd: string }> },
          ClaimsResponse>` named `'extract_claims'`, model class
          `'smart'`.
        - `outputSchema` is `claimsResponseSchema`.
        - `run` builds a system prompt that names each `claim_type`
          and explains the worthiness ladder (opinion / hedged /
          trivially-known → low; specific verifiable → medium /
          high). The user prompt lists each section like
          `## <title> [sectionId=<id>]\n<contentMd>`. Calls
          `routeJsonChat` with `class: 'smart'` and
          `schema: claimsResponseSchema`. Emits `task_started`
          (`{ stage: 'extract_claims' }`) and `task_completed`
          (`{ stage: 'extract_claims', count }`).
        - Unit test stubs `routeJsonChat` to return two claims
          (one `medium`, one `low`); asserts the returned shape and
          event order; asserts the system prompt mentions the
          worthiness ladder.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-8-10: `verify_claim` stage with sources reuse
      Goal: A `Stage` that gathers evidence for a single claim,
      reusing accepted sources from the session before issuing a
      search query.
      Touches: `src/server/pipeline/stages/verify-claim.ts`,
      `tests/unit/pipeline/verify-claim.test.ts`.
      Acceptance:
        - Exports `verifyClaim: Stage<{ claim: Claim;
          acceptedSources: Array<{ id: number; url: string; title:
          string; summary: string; rawExcerpt: string }> },
          { evidence: Array<EvidenceItem & { sourceId: number |
          null }>; cached: boolean }>` named `'verify_claim'`,
          model class `'search'`.
        - `outputSchema` validates `evidence` via
          `evidenceResponseSchema`'s item shape extended with
          `sourceId: z.number().int().nullable()`.
        - `run` first builds a token bag from the claim
          (`claim.span.text` lowercased, split on `\W+`, length > 3,
          deduped). For each accepted source it scores
          `(rawExcerpt + summary).toLowerCase()` overlap; if any
          source has an overlap >= 2 tokens it pushes
          `{ url, snippet: source.rawExcerpt.slice(0, 600),
          supports: true, sourceId: source.id }` into the evidence
          pool. If the resulting pool has ≥ 1 item it returns it
          with `cached: true` and emits `task_completed`
          (`{ count, cached: true }`) without calling the search
          model.
        - Otherwise it calls `routeJsonChat` with `class: 'search'`,
          `schema: evidenceResponseSchema`, and a prompt asking for
          up to 5 short snippets bearing on the claim, each with
          `supports: true|false`. Each item is mapped to
          `{ ...item, sourceId: null }`. Emits `task_completed`
          (`{ count, cached: false }`).
        - Unit test stubs the source pool with one matching source
          and asserts the cache-hit path returns `cached: true`
          without calling `routeJsonChat`. A second test stubs
          `routeJsonChat` returning two evidence items and an empty
          source pool; asserts `cached: false` and that each
          evidence item has `sourceId: null`.
        - `pnpm test` and `pnpm typecheck` exit 0.
      Decision needed: how to score "source matches claim". Default:
      naive token overlap (≥ 2 tokens > 3 chars). Add a `// TODO:
      replace with embedding similarity` marker. Cheap enough to be
      net-positive even with false positives — the adjudicator
      filters noise downstream.

- [x] T-8-11: `adjudicate_claim` stage
      Goal: A `Stage` that emits a verdict + justification + citation
      list given a claim and its evidence pool.
      Touches: `src/server/pipeline/stages/adjudicate-claim.ts`,
      `tests/unit/pipeline/adjudicate-claim.test.ts`.
      Acceptance:
        - Exports `adjudicateClaim: Stage<{ claim: Claim; evidence:
          EvidenceItem[] }, Adjudication>` named
          `'adjudicate_claim'`, model class `'smart'`.
        - `outputSchema` is `adjudicationSchema`.
        - `run` builds a prompt naming the claim text, span
          context, claim type, and the evidence pool (each as
          `- [supports=<bool>] <url> — <snippet>`). System prompt
          requires `verdict ∈ {verified, contradicted,
          unverifiable, needs_caveat}` with definitions and asks
          for ≤ 3 citation URLs drawn from the evidence pool. Calls
          `routeJsonChat` with `class: 'smart'` and `schema:
          adjudicationSchema`. Emits `task_started`
          (`{ stage: 'adjudicate_claim' }`) and `task_completed`
          (`{ stage: 'adjudicate_claim', verdict }`).
        - If `evidence.length === 0`, the stage skips the LLM call
          and returns `{ verdict: 'unverifiable', justification:
          'No evidence available.', citationUrls: [] }`, still
          emitting `task_started` / `task_completed`.
        - Unit test stubs `routeJsonChat` to return
          `{ verdict: 'verified', justification: 'matches',
          citationUrls: ['https://x.test'] }`; asserts the returned
          shape and event order; asserts the user prompt contains
          the claim text and an evidence URL. A second test passes
          `evidence: []` and asserts the no-evidence short-circuit
          fires without calling `routeJsonChat`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-8-12: `runFactCheck` orchestration helper +
      `startFactCheckAction`
      Goal: A non-runner code path that runs the three-stage
      fact-check pipeline with `span_hash` idempotency.
      Touches: `src/server/pipeline/run-fact-check.ts`,
      `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/pipeline/run-fact-check.test.ts`,
      `tests/unit/sessions/start-fact-check-action.test.ts`.
      Acceptance:
        - `run-fact-check.ts` exports `runFactCheck({ sessionId,
          userId, force }: { sessionId: number; userId: number;
          force?: boolean })` that: loads session/plan/profile
          (fails with `session_invalid` on validation errors);
          short-circuits with `no_draft` if `draftMd` is empty;
          loads all `section_drafts`; loads accepted sources via
          `listSessionSources(...).filter(s.status === 'accepted')`;
          creates a `'factcheck'` round via `createCritiqueRound`
          with `draftHash = spanHash(session.draftMd)`; runs
          `extractClaims.run({ plan, sectionDrafts })`; for each
          claim: computes `hash = spanHash(claim.span.text)`; if
          `!force` and `findClaimBySpanHash(userId, sessionId,
          hash)` returns a row whose verdict exists, the helper
          emits `task_progress` (`{ stage: 'fact_check', skipped:
          hash }`) and continues; otherwise inserts the claim,
          and (only if `claim.checkWorthiness !== 'low'`) runs
          `verifyClaim.run` then `adjudicateClaim.run`, persists
          the verdict via `insertClaimVerdict`, persists each
          evidence row via `insertClaimEvidence` (with `sourceId`
          from cache hits or `null` from the search model). Emits
          `artifact_updated` (`{ kind: 'claim_verdict', claimId,
          verdict }`) on each persisted verdict and a final
          `artifact_updated` (`{ kind: 'factcheck_round', roundId,
          claimCount, verdictCount }`); returns
          `{ ok: true, roundId, claimCount, verdictCount }`.
        - `actions.ts` adds `startFactCheckAction(sessionId: number,
          force?: boolean)`: calls `requireUser`, calls
          `runFactCheck({ ..., force: !!force })`, revalidates path
          on success.
        - Unit test for `runFactCheck` stubs the three stage
          modules, the repos, and the bus; drives the helper with
          two `medium`-worthy claims and one `low` claim; asserts:
          `extractClaims` runs once; `verifyClaim` and
          `adjudicateClaim` run twice (the `low` claim is inserted
          but skipped); both verdicts are persisted; one
          `artifact_updated: claim_verdict` per verdict plus the
          final `factcheck_round` event are emitted.
        - A second test seeds `findClaimBySpanHash` to return a
          row with an existing verdict for one of the claims and
          asserts that claim is skipped (`task_progress` emitted)
          when `force === false`, and re-verified when
          `force === true`.
        - Action test mocks `requireUser` and `runFactCheck`,
          asserts `force` is forwarded.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-8-13: Per-claim action server actions
      Goal: Server actions for accept-correction / dismiss-verdict /
      mark-as-opinion on a single claim.
      Touches: `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/sessions/claim-actions.test.ts`.
      Acceptance:
        - Adds `dismissClaimAction(sessionId, claimId)`: calls
          `requireUser`, then `setClaimStatus(user.id, claimId,
          'dismissed')`, then `revalidatePath`. Returns
          `{ ok: true }` or `{ ok: false, error: 'not_found' }`.
        - Adds `markClaimOpinionAction(sessionId, claimId)`: same
          shape but `status = 'opinion'`. Future fact-check runs
          (T-8-12) skip claims whose latest `claims` row has
          `status === 'opinion'` — implementation note: the helper
          `findClaimBySpanHash` returns the latest row; the runner
          checks `row.status` before re-verifying. (T-8-12's tests
          already cover the skip path; this task adds an extra unit
          assertion that an `opinion` row also short-circuits.)
        - Adds `acceptClaimCorrectionAction(sessionId, claimId)`:
          calls `requireUser`; loads the claim and its latest
          verdict (helper: `getClaimWithLatestVerdict(userId,
          claimId)` added in claims-repo); if the verdict is
          `verified` returns `{ ok: false, error:
          'no_correction_needed' }`; otherwise calls
          `regenerateSection({ ..., sectionId:
          claim.span.sectionId, instruction: '[fact-check] ' +
          verdict.verdict + ': ' + verdict.justification +
          ' — claim text: ' + claim.claimText })`; on success calls
          `setClaimStatus(user.id, claimId, 'dismissed')`. Returns
          the regenerate-section result passthrough.
        - Unit test mocks the helpers and `regenerateSection`;
          asserts each action passes `user.id` through; asserts
          `acceptClaimCorrectionAction` short-circuits on `verified`.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-8-14: Active critics configuration + ad-hoc critic action
      Goal: Server action that updates `sessions.active_critics`
      with a new built-in enabledIds list and/or an appended
      custom critic.
      Touches: `src/server/sessions/repo.ts`,
      `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/sessions/active-critics-action.test.ts`.
      Acceptance:
        - `repo.ts` exports `updateSessionActiveCritics(userId, id,
          activeCritics: ActiveCritics)` mirroring the existing
          `updateSessionPlan` (ownership check, returns updated row
          or `null`, sets `updated_at`).
        - `actions.ts` adds `setActiveCriticsAction(sessionId,
          payload: unknown)`: calls `requireUser`; validates payload
          via `activeCriticsSchema` (`safeParse` → `{ ok: false,
          error: 'validation' }` on failure); each payload may
          include a new custom critic with auto-generated id
          `'custom_' + Date.now() + '_' + n` if the client sends
          `id: ''`; calls `updateSessionActiveCritics`; returns
          `{ ok: true }` and revalidates path.
        - Unit test mocks `requireUser` and the repo; asserts a
          valid payload is persisted, a malformed `enabledIds`
          (non-string element) yields `validation`, and an empty
          `id` on a custom critic is replaced with a generated id
          before persistence.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-8-15: Runner — `'review'` state park + `finishReviewAction`
      Goal: When the runner enters the `'review'` case it emits
      a `state_changed` and parks for `review_done`; on resolve it
      transitions to `'decoration'`. Drafting transitions out are
      hooked to recursively continue the runner so review-park
      activates immediately when drafting completes.
      Touches: `src/server/pipeline/runner.ts`,
      `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/pipeline/runner-review.test.ts`.
      Acceptance:
        - The `'drafting'` case in `runner.ts` is updated to call
          `await startRunner(sessionId, userId)` immediately after
          transitioning to `'review'` (matching the
          `'planning' → 'research'` and `'research' → 'drafting'`
          patterns).
        - A new `case 'review':` parks via
          `ctx.userInput('review_done', z.object({ action:
          z.literal('finish') }))`; on resolve calls
          `updateSessionState(userId, sessionId, 'decoration')` and
          emits `state_changed` (`{ state: 'decoration' }`); does
          NOT recursively call `startRunner` (decoration runner is
          Epic 9).
        - `actions.ts` adds `finishReviewAction(sessionId)`
          (parallel to `finishDraftAction`): `requireUser`, then
          `resolveUserInput(sessionId, { action: 'finish' })`;
          returns `{ ok: true }` or `{ ok: false, error:
          'no_pending_review' }`.
        - Unit test stubs `updateSessionState` and drives the
          runner from `'review'` state; asserts the `awaiting_user`
          event with `prompt: 'review_done'` is emitted; resolves
          the input and asserts state advances to `'decoration'`.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-8-16: Workbench `<ReviewPane />` shell + Critique tab +
      page wiring
      Goal: While `session.state === 'review'`, the workbench
      shows a two-tab pane. The Critique tab shows past rounds and
      their findings, exposes a "Run review" button, and renders
      per-finding actions.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`,
      `src/app/(app)/sessions/[id]/review-pane.tsx`,
      `src/app/(app)/sessions/[id]/critique-tab.tsx`,
      `src/app/(app)/sessions/[id]/finding-card.tsx`.
      Acceptance:
        - `page.tsx` mounts `<ReviewPane sessionId={id} plan={plan}
          draftMd={session.draftMd ?? ''} initialCritiqueRounds={...}
          initialFactCheckRounds={...} initialClaims={...} />` (a
          client component) when `state === 'review'`. The page
          fetches initial rounds via `listSessionRounds(user.id,
          id, 'critique')` and `listSessionRounds(user.id, id,
          'factcheck')`; for each critique round it loads its
          findings; for fact-check it loads claims + latest
          verdicts.
        - `review-pane.tsx` renders a tab strip with two tabs
          (`critique` | `factcheck`); the active tab is local
          state. It subscribes to `useSessionEvents` and on each
          `artifact_updated` updates the right local state slice
          by `kind`: `finding` appends; `critique_round` records
          the round; `claim_verdict` updates the matching claim;
          `factcheck_round` records the round.
        - The Critique tab (`critique-tab.tsx`) renders a "Run
          review" button at the top wired to `startReviewAction`,
          plus an active-critics editor (built-in checkboxes seeded
          from `BUILTIN_CRITICS`, an "Add custom critic" textarea +
          label input that posts `setActiveCriticsAction`). Below,
          rounds are shown most-recent first; each round expands to
          show its findings grouped by `criticId`. Each finding
          renders as a `<FindingCard>` showing severity, span text
          (clickable button stub — calls a `scrollToSection(id)`
          helper passed down), problem, suggestion, rationale, and
          three buttons calling `dismissFindingAction`,
          `applyFindingAction`, and `rewriteFromFindingAction`.
          Status visually distinguishes `dismissed` (gray) /
          `applied` / `rewritten` (faded) / `open` (default).
        - A "Finish review" button at the bottom of the pane (in
          the shell, visible on both tabs) calls
          `finishReviewAction(sessionId)`. Disabled until at least
          one round (critique or factcheck) exists.
        - `pnpm typecheck` and `pnpm lint` exit 0.
      Decision needed: should "Finish review" require ≥ 1 round?
      Default: yes — review with no rounds is a no-op; the user can
      still run zero rounds by re-entering review later via a
      future "back to review" affordance. The button is disabled
      with an inline hint.

- [x] T-8-17: Fact-check tab UI in `<ReviewPane />`
      Goal: The Fact-check tab shows claims with their latest
      verdicts and per-claim actions, plus a "Run fact-check"
      button.
      Touches: `src/app/(app)/sessions/[id]/factcheck-tab.tsx`,
      `src/app/(app)/sessions/[id]/review-pane.tsx`,
      `src/app/(app)/sessions/[id]/claim-card.tsx`.
      Acceptance:
        - `factcheck-tab.tsx` renders a "Run fact-check" button
          wired to `startFactCheckAction(sessionId, false)` and a
          "Force re-run" toggle that, when on, passes `true`. While
          `runFactCheck` is in flight a "Checking…" spinner shows
          (driven off the latest `task_started` /`task_completed`
          events for stage `extract_claims` |
          `adjudicate_claim`).
        - Below, the tab renders each claim in plan order as a
          `<ClaimCard>` showing the claim text, the section
          (clickable to `scrollToSection`), `claim_type`,
          `check_worthiness`, the latest verdict pill (`verified`
          green, `contradicted` red, `unverifiable` gray,
          `needs_caveat` amber), the verdict justification, and a
          collapsible evidence list (each item showing url +
          snippet + supports indicator). Three action buttons:
          "Accept correction" (calls
          `acceptClaimCorrectionAction`), "Dismiss verdict" (calls
          `dismissClaimAction`), "Mark as opinion" (calls
          `markClaimOpinionAction`). Buttons reflect status (e.g.
          dismissed claims are visually muted).
        - `review-pane.tsx` mounts the new tab when `active ===
          'factcheck'` and routes the same `useSessionEvents`
          slice updates (handled in T-8-16; this task wires the
          rendering).
        - `pnpm typecheck` and `pnpm lint` exit 0.

- [x] T-8-18: Eval fixtures for the four review stages
      Goal: Capture one input/expected snapshot per new stage so
      the Epic 12 harness can replay them.
      Touches:
      `tests/eval/fixtures/run_critic/habr-longread-1.json`,
      `tests/eval/fixtures/extract_claims/habr-longread-1.json`,
      `tests/eval/fixtures/verify_claim/habr-longread-1.json`,
      `tests/eval/fixtures/adjudicate_claim/habr-longread-1.json`,
      `tests/eval/README.md`,
      `tests/unit/pipeline/run-critic.test.ts`,
      `tests/unit/pipeline/extract-claims.test.ts`,
      `tests/unit/pipeline/verify-claim.test.ts`,
      `tests/unit/pipeline/adjudicate-claim.test.ts`.
      Acceptance:
        - Each fixture is a JSON file with shape
          `{ "input": {...}, "expected": { "schemaRef":
          "<stageExport>.outputSchema", "snapshot": {...} } }`.
          Inputs reuse the Habr long-read profile + plan + draft
          fixtures from Epic 5/7 so the chain stays consistent.
          The `run_critic` fixture uses the `editorial` built-in
          critic (one fixture, not seven — the registry is data-
          only and seven fixtures would be redundant for what's
          really one stage's behavior).
        - `tests/eval/README.md` is updated to list the four new
          fixtures alongside the existing eight; the table grows to
          twelve rows.
        - One additional unit test per stage (added to the
          existing test files from T-8-6, T-8-9, T-8-10, T-8-11)
          loads its fixture's `input`, runs the stage with a stub
          `routeJsonChat` returning `expected.snapshot`, and asserts
          the stage's return equals `expected.snapshot`.
        - `pnpm test` exits 0.
      Notes: No real LLM calls; the eval harness ships in Epic 12.
      A `run_critic` fixture per critic can be added in Epic 12 if
      the rubric judge wants per-persona regression coverage.

---

## Epic 9 — Decoration suggestions

**Status: planned**

**Goal:** When the user clicks "Finish review" the session transitions
to `'decoration'`. The workbench swaps to a `<DecorationPane />` that
shows the locked draft alongside a list of proposed insertions
(pull-quotes, callouts, code blocks, comparison tables, info boxes).
A "Run decoration" button calls a single-shot `propose_decoration`
LLM stage that returns a structured `{ suggestions: [...] }` payload;
the suggestions persist on `sessions.decoration` (JSONB — no new
tables) keyed by `{ sectionId, paragraphIndex }` anchors. Per
suggestion, the user can **accept** (the helper deterministically
inserts the suggestion's `contentMd` into the corresponding
`section_drafts` row at `paragraphIndex` and recomposes
`sessions.draftMd`) or **reject** (status flip only). Repeat
"Run decoration" appends a new round, preserving prior statuses. When
the user clicks "Finish decoration", the runner transitions to
`'illustration'`. One eval fixture is captured for the new stage.

Decision needed: keep decoration suggestions in `sessions.decoration`
JSONB or introduce a `decoration_suggestions` table? Default: **JSONB**
on `sessions.decoration` — the column already exists in the schema
(see `drizzle/0009_*` / current `schema.ts`), volume is bounded
(≤ 30 suggestions per session), and there is no cross-session query
pattern that demands a relational table. If Epic 10 later needs to
join image-slot rows the same column can be migrated then.

### Tasks

- [x] T-9-1: Decoration domain schemas + paragraph helpers
      Goal: Typed shapes for decoration suggestions and the persisted
      `sessions.decoration` payload, plus pure helpers for splitting
      and rejoining a section's markdown by paragraphs.
      Touches: `src/server/sessions/decoration.ts`,
      `tests/unit/sessions/decoration-schema.test.ts`.
      Acceptance:
        - Exports `decorationKindSchema = z.enum(['pull_quote',
          'callout', 'code_block', 'comparison_table', 'info_box'])`.
        - Exports `suggestionStatusSchema = z.enum(['proposed',
          'accepted', 'rejected'])`.
        - Exports `decorationSuggestionSchema`: `{ id: z.string()
          .min(1).max(60), kind: decorationKindSchema, sectionId:
          z.string().min(1).max(120), paragraphIndex: z.number().int()
          .min(0).max(500), contentMd: z.string().min(1).max(4000),
          rationale: z.string().min(1).max(800), status:
          suggestionStatusSchema.default('proposed') }`.
        - Exports `proposeDecorationResponseSchema = z.object({
          suggestions: z.array(decorationSuggestionSchema.omit({ id:
          true, status: true })).max(30) })` — the schema the
          `propose_decoration` stage emits (no id/status, both
          assigned by the orchestrator).
        - Exports `decorationRoundSchema = z.object({ id: z.string()
          .min(1), draftHash: z.string().min(1), createdAt:
          z.string(), suggestions: z.array(decorationSuggestionSchema)
          })`.
        - Exports `decorationStateSchema = z.object({ rounds:
          z.array(decorationRoundSchema).default([]) })` and
          `parseDecorationState(value: unknown): DecorationState`
          which returns `{ rounds: [] }` on null/invalid input.
        - Exports the helper `splitParagraphs(md: string): string[]`
          that splits on `/\n{2,}/` and trims trailing whitespace per
          chunk; an empty string returns `[]`.
        - Exports `joinParagraphs(paragraphs: string[]): string` that
          rejoins with `'\n\n'`.
        - Exports `insertParagraph(md: string, index: number,
          contentMd: string): string` that splits, clamps `index` to
          `[0, paragraphs.length]`, splices `contentMd.trim()` in,
          and rejoins; clamping is silent (no throw).
        - Exports type aliases `DecorationKind`, `DecorationSuggestion`,
          `DecorationRound`, `DecorationState`,
          `ProposeDecorationResponse` via `z.infer<...>`.
        - Unit test asserts each schema accepts a valid hand-built
          value and rejects one obvious violation per schema (kind =
          `'banner'`, paragraphIndex = `-1`, empty `contentMd`);
          asserts `parseDecorationState(null)` returns `{ rounds: [] }`;
          asserts `splitParagraphs('a\n\nb\n\n\nc')` length is 3;
          asserts `insertParagraph('a\n\nb', 1, 'X')` equals
          `'a\n\nX\n\nb'`; asserts `insertParagraph('a', 99, 'X')`
          clamps to `'a\n\nX'`.
        - `pnpm test` and `pnpm typecheck` exit 0.

- [x] T-9-2: Decoration persistence helpers
      Goal: User-scoped read/append/status helpers for
      `sessions.decoration` JSONB.
      Touches: `src/server/sessions/decoration-repo.ts`,
      `tests/unit/sessions/decoration-repo.test.ts`.
      Acceptance:
        - Exports `getDecorationState(userId, sessionId):
          Promise<DecorationState>` that loads the session
          (ownership-checked via `getSession`), runs
          `parseDecorationState(session.decoration)`, returns the
          parsed value or `{ rounds: [] }` for foreign/missing
          sessions.
        - Exports `appendDecorationRound(userId, sessionId, round:
          { draftHash: string; suggestions:
          ProposeDecorationResponse['suggestions'] }):
          Promise<DecorationRound | null>` that:
          - generates `roundId = 'r_' + Date.now() + '_' +
            randomBytes(4).toString('hex')`;
          - assigns each suggestion `id = 's_' + roundId + '_' + i`
            and `status = 'proposed'`;
          - reads existing state, appends the new round, persists
            via `db.update(sessions)` with the ownership predicate
            and `updatedAt = new Date()`;
          - returns the new round, or `null` if the update affected
            zero rows.
        - Exports `setSuggestionStatus(userId, sessionId,
          suggestionId, status: 'accepted' | 'rejected'):
          Promise<DecorationSuggestion | null>` that mutates the
          matching suggestion's status across all rounds, persists
          the updated state, returns the updated suggestion or
          `null` if not found / not owned.
        - Exports `findSuggestion(userId, sessionId, suggestionId):
          Promise<{ round: DecorationRound; suggestion:
          DecorationSuggestion } | null>`.
        - Unit test mocks the db client (mirroring
          `tests/unit/sessions/critique-repo.test.ts`); asserts a
          foreign session yields `null` from
          `appendDecorationRound`; asserts append produces
          deterministic suggestion ids in order; asserts
          `setSuggestionStatus` flips status and rejects unknown
          ids.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-9-3: `propose_decoration` stage
      Goal: Single-shot smart-model stage that takes the locked
      draft + plan + profile and returns structured decoration
      suggestions.
      Touches: `src/server/pipeline/stages/propose-decoration.ts`,
      `tests/unit/pipeline/propose-decoration.test.ts`.
      Acceptance:
        - Exports `proposeDecoration: Stage<{ profile: ProfileRow;
          plan: Plan; sectionDrafts: Array<{ sectionId: string;
          contentMd: string }> }, ProposeDecorationResponse>` with
          `name: 'propose_decoration'`, `modelClass: 'smart'`,
          `inputSchema` and `outputSchema =
          proposeDecorationResponseSchema`.
        - System prompt instructs the model to (a) propose at most
          ~12 high-impact decorations, (b) cite a `sectionId` from
          the provided sections, (c) set `paragraphIndex` to the
          paragraph slot WITHIN that section's `contentMd` (split
          on blank lines) where the decoration should appear (0 =
          before first paragraph, N = after last), (d) emit
          `contentMd` as ready-to-paste markdown for the chosen
          `kind` (e.g. `> ...` for `pull_quote`,
          ```` ```\n...\n``` ```` for `code_block`, GFM table for
          `comparison_table`, fenced or HTML callout for `callout` /
          `info_box` per the profile's `markupRules`), (e) keep
          `rationale` to one sentence, (f) respond with valid JSON
          `{ suggestions: [...] }` only.
        - User-prompt content is built like `run-review`: each
          section is rendered as `## ${title} [sectionId=${id}]`
          followed by the section's `contentMd`.
        - The stage emits `task_started` and `task_completed`
          events with `{ stage: 'propose_decoration', count:
          result.suggestions.length }` (matching `run-review`).
        - Calls `routeJsonChat({ system, user, schema:
          proposeDecorationResponseSchema, class: 'smart' })` and
          returns `result`.
        - Unit test mocks `routeJsonChat` (vi.mock pattern from
          `run-review-stage.test.ts`); asserts the returned shape
          matches the mock; asserts `class: 'smart'` is passed;
          asserts the system prompt mentions every allowed `kind`
          enum value; asserts an empty `sectionDrafts` array still
          yields a valid call.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-9-4: Apply-decoration helper (deterministic edit)
      Goal: Pure persistence helper that takes one accepted
      suggestion, updates its section's `section_drafts.contentMd`
      via `insertParagraph`, and recomposes `sessions.draftMd` from
      all `section_drafts` rows in plan order.
      Touches: `src/server/pipeline/apply-decoration.ts`,
      `tests/unit/pipeline/apply-decoration.test.ts`.
      Acceptance:
        - Exports `applyDecoration({ sessionId, userId,
          suggestionId }):
          Promise<{ ok: true; revisedDraftMd: string }
          | { ok: false; error: 'not_found' | 'session_invalid'
          | 'plan_invalid' | 'section_missing' }>`.
        - Resolves the session (ownership), parses
          `session.plan` via `planSchema` (errors → `plan_invalid`),
          looks up the suggestion via `findSuggestion`; if missing
          → `not_found`.
        - Loads the section's draft via `getSectionDraft(userId,
          sessionId, sectionId)`; if missing → `section_missing`.
        - Computes `nextContentMd = insertParagraph(currentContentMd,
          paragraphIndex, contentMd)`; calls `upsertSectionDraft` to
          persist.
        - Recomposes `revisedDraftMd` by calling
          `listSectionDrafts(userId, sessionId)`, then ordering rows
          by `plan.sections.findIndex(s => s.id === row.sectionId)`
          (sections not in plan keep their natural db order at the
          tail), and joining `contentMd`s with `'\n\n'`.
        - Calls `updateSessionDraft(userId, sessionId,
          revisedDraftMd)` and `setSuggestionStatus(userId,
          sessionId, suggestionId, 'accepted')`.
        - Returns `{ ok: true, revisedDraftMd }`.
        - Unit test mocks `getSession`, `getSectionDraft`,
          `upsertSectionDraft`, `listSectionDrafts`,
          `updateSessionDraft`, and the decoration repo; asserts a
          missing suggestion yields `not_found`; asserts the
          rebuilt draftMd contains the inserted snippet at the
          expected position; asserts plan order is honored when
          recomposing; asserts the suggestion ends in `accepted`
          status.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-9-5: `runDecoration` orchestrator
      Goal: Top-level wrapper (analogue of `run-review.ts`) that
      validates the session, calls the stage with prepared inputs,
      persists a new round, and emits artifact events.
      Touches: `src/server/pipeline/run-decoration.ts`,
      `tests/unit/pipeline/run-decoration.test.ts`.
      Acceptance:
        - Exports `async function runDecoration({ sessionId,
          userId }): Promise<{ ok: true; roundId: string;
          suggestionCount: number } | { ok: false; error:
          'session_invalid' | 'no_draft' }>`.
        - Loads `getSession`, `getProfile`, parses `planSchema`;
          returns `session_invalid` on any failure. Returns
          `no_draft` if `session.draftMd` is null/empty.
        - Computes `draftHash = spanHash(session.draftMd)` (reuse
          the helper from `src/server/sessions/claims.ts`).
        - Builds a minimal `ctx` with a real `emit`
          (`emitEvent(sessionId, ...)`), a no-op `userInput`
          (mirrors `run-review.ts`), no-op `log.append`, and an
          unused `llm` placeholder.
        - Calls `proposeDecoration.run({ profile, plan,
          sectionDrafts: await listSectionDrafts(userId,
          sessionId) }, ctx)`.
        - Calls `appendDecorationRound(userId, sessionId,
          { draftHash, suggestions: result.suggestions })`; if it
          returns null treats that as `session_invalid`.
        - For each persisted suggestion emits
          `artifact_updated` with `{ kind:
          'decoration_suggestion', suggestion }`. After the loop
          emits `artifact_updated` with `{ kind:
          'decoration_round', roundId: round.id,
          suggestionCount }`.
        - Returns `{ ok: true, roundId: round.id,
          suggestionCount: round.suggestions.length }`.
        - Unit test mocks the stage and the repo helpers; asserts
          the happy path emits both event kinds in order; asserts
          a missing draft short-circuits to `no_draft` BEFORE
          calling the stage.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-9-6: Decoration server actions
      Goal: Server actions that wire the pane to the orchestrator
      and the per-suggestion helpers.
      Touches: `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/sessions/decoration-actions.test.ts`.
      Acceptance:
        - Adds `startDecorationAction(sessionId): Promise<{ ok:
          true; roundId: string; suggestionCount: number } | {
          ok: false; error: ... }>` that calls `requireUser` then
          `runDecoration({ sessionId, userId: user.id })`;
          revalidates the session path on success.
        - Adds `acceptDecorationAction(sessionId, suggestionId):
          Promise<{ ok: true; revisedDraftMd: string } | { ok:
          false; error: string }>` that calls `requireUser` then
          `applyDecoration({ sessionId, userId: user.id,
          suggestionId })`; revalidates on success. Validates
          `suggestionId` via `z.string().min(1).max(80)`.
        - Adds `rejectDecorationAction(sessionId, suggestionId):
          Promise<{ ok: true } | { ok: false; error:
          'not_found' | 'validation' }>` that calls
          `setSuggestionStatus(user.id, sessionId, suggestionId,
          'rejected')`; revalidates on success.
        - Adds `finishDecorationAction(sessionId): Promise<{ ok:
          true } | { ok: false; error:
          'no_pending_decoration' }>` mirroring
          `finishReviewAction`: calls `resolveUserInput(sessionId,
          { action: 'finish' })`.
        - Unit test mocks `requireUser`, `runDecoration`,
          `applyDecoration`, `setSuggestionStatus`, and
          `resolveUserInput`; asserts each action passes
          `user.id` through; asserts validation rejects an empty
          `suggestionId`; asserts `finishDecorationAction` returns
          `no_pending_decoration` when nothing is parked.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-9-7: Runner — `'decoration'` state park + transition to
      `'illustration'`
      Goal: When the runner enters the `'decoration'` case it
      emits a `state_changed` (already done by the upstream
      review case) and parks for `decoration_done`; on resolve it
      transitions to `'illustration'`.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-decoration.test.ts`.
      Acceptance:
        - The `'review'` case in `runner.ts` is updated to call
          `await startRunner(sessionId, userId, true)` immediately
          after transitioning to `'decoration'` (matching the
          `'planning' → 'research' → 'drafting' → 'review'`
          chain) so the decoration park activates without waiting
          for a fresh runner kick.
        - A new `case 'decoration':` parks via
          `ctx.userInput('decoration_done', z.object({ action:
          z.literal('finish') }))`; on resolve calls
          `updateSessionState(userId, sessionId, 'illustration')`,
          emits `state_changed` (`{ state: 'illustration' }`),
          and does NOT recursively call `startRunner` (the
          illustration runner is Epic 10).
        - Unit test (mirrors `tests/unit/pipeline/runner-review.test.ts`)
          stubs `getSession` to return a `decoration` session and
          `updateSessionState`; drives the runner; asserts an
          `awaiting_user` event with `prompt: 'decoration_done'`
          fires; calls `resolveUserInput` and asserts state
          advances to `'illustration'`.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-9-8: `<DecorationPane />` shell + `<SuggestionCard />`
      Goal: Workbench pane for the `'decoration'` state that
      lists suggestions per round and exposes per-suggestion
      actions plus a "Finish decoration" button.
      Touches:
      `src/app/(app)/sessions/[id]/decoration-pane.tsx`,
      `src/app/(app)/sessions/[id]/suggestion-card.tsx`.
      Acceptance:
        - `decoration-pane.tsx` is a `'use client'` component
          with props `{ sessionId: number; plan: Plan;
          initialState: DecorationState; sectionDrafts:
          Array<{ sectionId: string; contentMd: string }> }`.
          Local state mirrors `initialState.rounds`; resyncs
          when `initialState` identity changes (same pattern as
          `review-pane.tsx`).
        - Subscribes via `useSessionEvents` and on
          `artifact_updated` with `kind ===
          'decoration_suggestion'` appends to the matching
          round (creating it if missing), and on `kind ===
          'decoration_round'` records the round shell.
        - Renders a "Run decoration" button calling
          `startDecorationAction` (disabled while the latest
          `task_started/task_completed` for stage
          `propose_decoration` is in flight; spinner reuses the
          same activeTasks pattern as `review-pane.tsx`).
        - Renders rounds most-recent-first; each round expands
          to a list of `<SuggestionCard>`s grouped by
          `sectionId` (in plan order).
        - `<SuggestionCard>` displays: `kind` pill, section
          title (clickable button stub calling a passed
          `scrollToSection(id)` prop, which in this task can be
          a no-op), `paragraphIndex`, the rendered `contentMd`
          inside a styled preview block (use a `<pre>` for
          `code_block`, `<blockquote>` for `pull_quote`,
          neutral box for others — no markdown renderer
          required, this is a v1 preview), the rationale, and
          two buttons "Accept" → `acceptDecorationAction`,
          "Reject" → `rejectDecorationAction`. After accept the
          card is shown in a faded `applied` state; after
          reject in a muted `rejected` state. Disabled when
          `status !== 'proposed'`.
        - A "Finish decoration" button at the bottom of the
          pane calls `finishDecorationAction(sessionId)`.
          Disabled until at least one round exists OR there is
          at least one accepted suggestion (so a user who
          rejects everything can still finish — guard purely
          on `rounds.length > 0`).
        - Includes one component-level unit test (Vitest +
          Testing Library, alongside existing component tests
          if any — otherwise just typecheck): renders the pane
          with one round and asserts the section title, kind
          pill, accept/reject buttons, and the rendered
          `contentMd` are present.
        - `pnpm typecheck` and `pnpm lint` exit 0.
      Notes: a real markdown renderer is not required for v1;
      previews are intentionally raw. Epic 11 (export) handles
      proper rendering. If a renderer is later wanted,
      `react-markdown` is the obvious choice.

- [x] T-9-9: Page wiring for `'decoration'` state
      Goal: `sessions/[id]/page.tsx` mounts `<DecorationPane />`
      when `session.state === 'decoration'`, loading the
      suggestions and section drafts server-side.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`.
      Acceptance:
        - When `session.state === 'decoration'`, the page
          parses `planSchema` (skip render with the existing
          fallback `<p>` if invalid), loads `decorationState =
          parseDecorationState(session.decoration)` and
          `sectionDrafts = await listSectionDrafts(user.id,
          id)`, and mounts `<DecorationPane sessionId={id}
          plan={plan} initialState={decorationState}
          sectionDrafts={sectionDrafts} />` inside the
          workbench area, alongside the existing branches for
          `briefing | planning | research | drafting | review`.
        - The fallback `<p className="text-sm text-gray-500">
          State: {session.state}</p>` continues to render for
          states that have no pane yet (`illustration | export
          | done`).
        - `pnpm typecheck` and `pnpm lint` exit 0.

- [x] T-9-10: Eval fixture for `propose_decoration` + fixture-driven
      unit test
      Goal: Capture one input/expected snapshot for the new
      stage so the Epic 12 harness can replay it.
      Touches:
      `tests/eval/fixtures/propose_decoration/habr-longread-1.json`,
      `tests/eval/README.md`,
      `tests/unit/pipeline/propose-decoration.test.ts`.
      Acceptance:
        - Adds `tests/eval/fixtures/propose_decoration/
          habr-longread-1.json` with shape `{ "input": {...},
          "expected": { "schemaRef":
          "proposeDecoration.outputSchema", "snapshot": {...} } }`.
          The `input` reuses the Habr long-read profile + plan +
          (non-empty) `sectionDrafts` already seeded for the
          earlier review fixtures (e.g. copy from
          `tests/eval/fixtures/run_review/habr-longread-1.json`)
          so the chain stays consistent; `snapshot` contains 3-5
          plausible suggestions covering at least three distinct
          `kind` values.
        - Updates `tests/eval/README.md` so the table grows by
          one row to thirteen.
        - Extends `tests/unit/pipeline/propose-decoration.test.ts`
          (created in T-9-3) with one additional case that loads
          the fixture, stubs `routeJsonChat` to return
          `expected.snapshot`, and asserts the stage's return
          deep-equals `expected.snapshot`.
        - `pnpm test` exits 0.
      Notes: No real LLM calls; the eval harness ships in Epic 12.

---

## Epic 10 — Image subsystem

**Status: planned**

**Goal:** When the user clicks "Finish decoration" the session
transitions to `'illustration'`. The workbench swaps to an
`<IllustrationPane />` that lists image slots (one `hero` plus zero or
more inline slots, each anchored to a section). For each slot the user
picks **generate** or **stock**. The generate pathway runs
`compose_image_prompt` (smart) → produces a structured JSON
`ImagePrompt` the user can edit → `prerender_images` (image class)
fans out 3 parallel calls to NanoBanana / Image 2 via the existing
`routeImage` and stores the bytes on disk under
`data/images/<sessionId>/<slotId>/<candidateId>.<ext>`. The stock
pathway runs `stock_keywords` (fast) → calls Unsplash via its HTTP API
and presents thumbnails. In both cases the user picks one candidate;
the helper inserts a deterministic Markdown image reference into the
draft (via the same `insertParagraph` / section-draft recompose path as
Epic 9). When the user clicks "Finish illustration", the runner
transitions to `'export'` (no export logic yet — Epic 11). Eval
fixtures captured for the three new LLM stages.

Decision needed: keep image state in `sessions.images` JSONB or split
into `image_slots` / `image_candidates` tables? Default: **JSONB** on
`sessions.images` — the column already exists in the schema, the data
is bounded (≤ 8 slots × ≤ 4 candidates per session), no cross-session
query is required, and the same persistence pattern works for both
generated and stock candidates without a polymorphic table.

Decision needed: which stock providers ship in v1 (Unsplash, Pexels,
Pixabay)? Default: **Unsplash only**. Single API, the most reliable
free tier, and `UNSPLASH_ACCESS_KEY` is already in `.env.example`.
Pexels / Pixabay env vars stay reserved; their clients are deferred.
If the key is missing the stock pathway returns an empty result and
the UI shows a "stock disabled — set UNSPLASH_ACCESS_KEY" notice.

Decision needed: insert images on per-candidate selection (Epic 9
decoration pattern) or recompose only on "Finish illustration"?
Default: **per-selection insertion**, mirroring decoration. First
selection inserts the Markdown image reference deterministically;
subsequent re-selections for the same slot update the candidate
metadata but the v1 UI disables the re-select buttons (a "swap" flow
is deferred). This keeps the runner contract identical to Epic 9.

### Tasks

- [x] T-10-1: Image domain schemas + slot helpers
      Goal: Typed shapes for image slots, structured prompts,
      candidates, and the persisted `sessions.images` payload, plus
      a pure helper that renders a Markdown image reference for an
      arbitrary candidate.
      Touches: `src/server/sessions/images.ts`,
      `tests/unit/sessions/images-schema.test.ts`.
      Acceptance:
        - Exports `imageSlotKindSchema = z.enum(['hero', 'inline'])`.
        - Exports `imageAspectSchema = z.enum(['16:9', '4:3', '1:1',
          '3:4'])`.
        - Exports `imageModeSchema = z.enum(['undecided', 'generate',
          'stock'])`.
        - Exports `imageCandidateSourceSchema = z.enum(['generated',
          'stock'])`.
        - Exports `imagePromptSchema = z.object({ subject:
          z.string().min(1).max(600), style: z.string().min(1)
          .max(200), composition: z.string().min(1).max(400),
          palette: z.array(z.string().min(1).max(60)).min(1).max(8),
          lighting: z.string().min(1).max(200), camera:
          z.string().max(200).optional(), mood: z.string().min(1)
          .max(200), negative: z.string().max(400).optional(),
          aspect: imageAspectSchema })`.
        - Exports `imageCandidateSchema = z.object({ id: z.string()
          .min(1).max(80), source: imageCandidateSourceSchema,
          localPath: z.string().min(1).max(400), sourceUrl:
          z.string().url().optional(), thumbUrl: z.string().url()
          .optional(), attribution: z.string().max(400).optional(),
          model: z.string().max(120).optional(), createdAt:
          z.string() })`.
        - Exports `imageSlotSchema = z.object({ id: z.string().min(1)
          .max(60), kind: imageSlotKindSchema, sectionId:
          z.string().min(1).max(120).optional(), paragraphIndex:
          z.number().int().min(0).max(500).optional(), brief:
          z.string().min(1).max(1000), altText: z.string().max(300)
          .optional(), mode: imageModeSchema.default('undecided'),
          prompt: imagePromptSchema.optional(), candidates:
          z.array(imageCandidateSchema).default([]),
          chosenCandidateId: z.string().max(80).optional() })`. The
          schema enforces (via `.superRefine`) that `kind === 'inline'`
          requires both `sectionId` and `paragraphIndex` to be set,
          and `kind === 'hero'` forbids them.
        - Exports `imageStateSchema = z.object({ slots:
          z.array(imageSlotSchema).max(20).default([]) })` and
          `parseImageState(value: unknown): ImageState` returning
          `{ slots: [] }` on null/invalid input.
        - Exports `proposeImageSlotsResponseSchema = z.object({
          heroBrief: z.string().min(1).max(1000), inlineSlots:
          z.array(z.object({ sectionId: z.string().min(1).max(120),
          paragraphIndex: z.number().int().min(0).max(500), brief:
          z.string().min(1).max(1000) })).max(8) })` — emitted by
          the `propose_image_slots` stage (no ids; the orchestrator
          assigns them).
        - Exports `stockKeywordsResponseSchema = z.object({ keywords:
          z.array(z.string().min(1).max(60)).min(1).max(8) })`.
        - Exports type aliases via `z.infer<...>`: `ImageSlotKind`,
          `ImageAspect`, `ImageMode`, `ImagePrompt`, `ImageCandidate`,
          `ImageSlot`, `ImageState`, `ProposeImageSlotsResponse`,
          `StockKeywordsResponse`.
        - Exports `renderImageMarkdown(candidate: ImageCandidate, alt:
          string): string` that returns
          `![alt](localPath)` for `source: 'generated'`,
          and `![alt](sourceUrl) <sub>${attribution}</sub>` for
          `source: 'stock'` (omits the `<sub>` if attribution is
          empty); `alt` is HTML-escaped (`&` → `&amp;`, `[` → `\[`,
          `]` → `\]`).
        - Unit test asserts each schema accepts a valid hand-built
          value and rejects one obvious violation
          (`palette: []`, `aspect: '21:9'`, `kind: 'inline'` without
          `sectionId`, candidate without `localPath`); asserts
          `parseImageState(null)` returns `{ slots: [] }`; asserts
          `renderImageMarkdown` for a generated candidate equals
          `'![Hero](/api/images/1/slot_a/c1.png)'` and for a stock
          candidate includes the attribution; asserts alt with `]`
          is escaped.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-2: Image persistence helpers (`sessions.images` JSONB)
      Goal: User-scoped read/write helpers for the image state on the
      `sessions.images` column, mirroring `decoration-repo.ts`.
      Touches: `src/server/sessions/images-repo.ts`,
      `tests/unit/sessions/images-repo.test.ts`.
      Acceptance:
        - Exports `getImageState(userId, sessionId):
          Promise<ImageState>` that loads via `getSession` and runs
          `parseImageState(session.images)`; returns `{ slots: [] }`
          on missing/foreign session.
        - Exports `setImageSlots(userId, sessionId, slots:
          ImageSlot[]): Promise<ImageSlot[] | null>` that overwrites
          the slot list (used after `propose_image_slots`); returns
          the persisted slots or `null` on update miss.
        - Exports `findSlot(userId, sessionId, slotId):
          Promise<ImageSlot | null>`.
        - Exports `updateSlot(userId, sessionId, slotId, mutator:
          (slot: ImageSlot) => ImageSlot):
          Promise<ImageSlot | null>` that loads the state, replaces
          the matching slot, and persists; returns the updated slot
          or `null` if not found / not owned. All other helpers
          below are implemented in terms of `updateSlot`.
        - Exports `setSlotMode(userId, sessionId, slotId, mode:
          'generate' | 'stock'): Promise<ImageSlot | null>`.
        - Exports `setSlotPrompt(userId, sessionId, slotId, prompt:
          ImagePrompt): Promise<ImageSlot | null>`.
        - Exports `appendSlotCandidates(userId, sessionId, slotId,
          candidates: ImageCandidate[]): Promise<ImageSlot | null>`
          that appends; the `id` field is honored as supplied
          (`prerender_images` and the stock client both assign ids).
        - Exports `setSlotChoice(userId, sessionId, slotId,
          candidateId: string): Promise<ImageSlot | null>` that
          rejects if the candidateId is not present and otherwise
          stamps `chosenCandidateId`.
        - Unit tests mock the db client mirroring
          `tests/unit/sessions/decoration-repo.test.ts`; assert each
          helper is a no-op (returns `null`) for foreign sessions;
          assert mode/prompt/candidates round-trip through
          `parseImageState`; assert `setSlotChoice` rejects an
          unknown candidate id.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-3: Image file storage utility + serve route
      Goal: Persist generated bytes (b64) and remote stock URLs to
      `data/images/<sessionId>/<slotId>/<candidateId>.<ext>` and serve
      them through a Next.js GET handler so the draft Markdown can
      reference them as `/api/images/...`.
      Touches: `src/server/images/storage.ts`,
      `src/app/api/images/[...path]/route.ts`,
      `tests/unit/images/storage.test.ts`,
      `.gitignore` (verify `data/` is already ignored — no change
      needed if so).
      Acceptance:
        - `storage.ts` exports `IMAGES_ROOT = path.resolve(
          process.cwd(), 'data', 'images')`.
        - Exports `saveImageFromB64({ sessionId, slotId, candidateId,
          mime, b64 }): Promise<{ localPath: string; absPath:
          string }>` that decodes the base64 string into a Buffer,
          ensures the directory exists via `fs.promises.mkdir`,
          writes the file with extension derived from `mime`
          (allowed: `image/png`, `image/jpeg`, `image/webp`; default
          `png`), and returns
          `localPath = '/api/images/<sessionId>/<slotId>/<candidate
          Id>.<ext>'`.
        - Exports `saveImageFromUrl({ sessionId, slotId, candidateId,
          url }): Promise<{ localPath: string; absPath: string }>`
          that fetches via `undici.fetch` (using the same
          `getDispatcher()` pattern as `openrouter.ts` to honor
          `HTTP_PROXY`), validates `Content-Type` matches one of
          the allowed image mimes, and writes the bytes the same
          way as `saveImageFromB64`.
        - The GET route `app/api/images/[...path]/route.ts`:
          - parses `params.path` (string array), rejoins to a
            relative path, refuses any segment containing `..` or
            starting with `.` (returns 400);
          - resolves `path.join(IMAGES_ROOT, relPath)` and asserts
            the resolved path stays within `IMAGES_ROOT` (else 400);
          - reads the file via `fs.promises.readFile`; on
            `ENOENT` returns 404;
          - sets `Content-Type` from the extension (`.png` →
            `image/png`, `.jpg`/`.jpeg` → `image/jpeg`, `.webp` →
            `image/webp`) and `Cache-Control: private, max-age=
            3600`;
          - returns the bytes as the response body.
        - Unit test exercises `saveImageFromB64` with a tiny inline
          1×1 PNG and asserts the file exists at the returned
          `absPath`, the bytes match, and `localPath` equals the
          expected `/api/images/...` URL; uses a tmp directory by
          monkey-patching `IMAGES_ROOT` via `vi.doMock` or by
          accepting an injected `root` parameter (whichever keeps
          tests deterministic — implementer's choice).
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.
      Notes: image bytes can be large; do NOT store them in the
      events table or in JSONB. Only `localPath` is persisted.

- [x] T-10-4: `propose_image_slots` stage
      Goal: Single-shot smart-model stage that, given the locked
      draft, plan, and profile, proposes one hero slot and 0–N
      inline slots anchored to specific section paragraphs.
      Touches: `src/server/pipeline/stages/propose-image-slots.ts`,
      `tests/unit/pipeline/propose-image-slots.test.ts`.
      Acceptance:
        - Exports `proposeImageSlots: Stage<{ profile: ProfileRow;
          plan: Plan; sectionDrafts: Array<{ sectionId: string;
          contentMd: string }> }, ProposeImageSlotsResponse>` with
          `name: 'propose_image_slots'`, `modelClass: 'smart'`,
          `inputSchema` and `outputSchema =
          proposeImageSlotsResponseSchema`.
        - System prompt instructs the model to (a) emit exactly one
          `heroBrief` summarizing the article's central image
          subject in 1–2 sentences, (b) propose at most 4 inline
          slots, each anchored to a `sectionId` from the provided
          sections plus a `paragraphIndex` (split on blank lines),
          (c) keep each `brief` concrete enough to feed an image
          generator (subject + tone) without specifying camera or
          composition (those are picked later by
          `compose_image_prompt`), (d) prefer slots that introduce
          a new technical concept or a key contrast, (e) respond
          with valid JSON `{ heroBrief, inlineSlots }` only.
        - User prompt mirrors `propose-decoration.ts`: each section
          rendered as `## ${title} [sectionId=${id}]\n${contentMd}`.
        - Emits `task_started` and `task_completed` events with
          `{ stage: 'propose_image_slots', count: heroCount +
          inlineSlots.length }`.
        - Calls `routeJsonChat({ system, user, schema:
          proposeImageSlotsResponseSchema, class: 'smart' })`.
        - Unit test mocks `routeJsonChat` (vi.mock pattern from
          `propose-decoration.test.ts`); asserts the returned shape;
          asserts `class: 'smart'` is passed; asserts the system
          prompt mentions the hero contract; asserts an empty
          `sectionDrafts` array still yields a valid call.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-5: `compose_image_prompt` stage
      Goal: Smart-model stage that produces a structured
      `ImagePrompt` JSON for a single slot.
      Touches: `src/server/pipeline/stages/compose-image-prompt.ts`,
      `tests/unit/pipeline/compose-image-prompt.test.ts`.
      Acceptance:
        - Exports `composeImagePrompt: Stage<{ profile: ProfileRow;
          plan: Plan; slot: { id: string; kind: ImageSlotKind;
          sectionId?: string; paragraphIndex?: number; brief:
          string }; surroundingMd?: string }, ImagePrompt>` with
          `name: 'compose_image_prompt'`, `modelClass: 'smart'`,
          `outputSchema = imagePromptSchema`.
        - System prompt instructs the model to fill every required
          field of `ImagePrompt`; pick `aspect` based on slot kind
          (default `16:9` for hero, `4:3` for inline); avoid
          banned content (logos, text overlays, real people unless
          the brief explicitly names them); respond with valid JSON
          only.
        - User prompt includes the slot brief, the
          surrounding paragraph(s) when provided, and the profile
          style/audience snippet.
        - Calls `routeJsonChat` and emits `task_started` /
          `task_completed` with `{ stage: 'compose_image_prompt',
          slotId }`.
        - Unit test mocks `routeJsonChat` to return a minimal
          valid `ImagePrompt`; asserts the stage returns it
          unchanged; asserts the input is forwarded into the user
          prompt (substring match on `slot.brief`).
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-6: `prerender_images` stage
      Goal: Image-class stage that fans out 3 parallel `routeImage`
      calls for one prompt and persists the bytes via the storage
      utility.
      Touches: `src/server/pipeline/stages/prerender-images.ts`,
      `tests/unit/pipeline/prerender-images.test.ts`.
      Acceptance:
        - Exports `prerenderImages: Stage<{ sessionId: number;
          slotId: string; prompt: ImagePrompt; count?: number }
          , { candidates: ImageCandidate[] }>` with
          `name: 'prerender_images'`, `modelClass: 'image'`. The
          `outputSchema` is `z.object({ candidates:
          z.array(imageCandidateSchema).min(1).max(4) })`.
        - Builds a single textual prompt from `ImagePrompt` (e.g.
          ``${subject} — ${style}, ${composition}, ${lighting},
          mood: ${mood}; palette: ${palette.join(', ')}; aspect
          ${aspect}; negative: ${negative ?? 'none'}``).
        - Spawns `count` (default 3, max 4) parallel `ctx.llm
          .routeImage({ prompt: text })` calls via `Promise
          .allSettled`. For each fulfilled result it picks the
          first element of `data` and:
          - if `b64_json` is set, calls `saveImageFromB64(...)`;
          - else if `url` is set, calls `saveImageFromUrl(...)`;
          - else marks the candidate as failed (skipped).
        - Each candidate gets `id = 'c_' + Date.now() + '_' +
          randomBytes(3).toString('hex') + '_' + i`, `source:
          'generated'`, `model: result.modelUsed`, `createdAt:
          new Date().toISOString()`.
        - At least one successful candidate is required; if all
          fail the stage throws an `Error('prerender_images: all
          calls failed')`.
        - Emits `task_started` (`{ stage: 'prerender_images',
          slotId }`) and `task_completed` (`{ stage:
          'prerender_images', slotId, count: candidates.length }`).
        - Unit test mocks `ctx.llm.routeImage` to return a fake
          response with `b64_json` and mocks `saveImageFromB64`
          via `vi.mock`; asserts 3 candidates returned, each with
          a `localPath`; asserts an all-fail run throws.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-7: `stock_keywords` stage
      Goal: Fast-model stage that turns a slot brief into 3–6
      stock-photo search keywords.
      Touches: `src/server/pipeline/stages/stock-keywords.ts`,
      `tests/unit/pipeline/stock-keywords.test.ts`.
      Acceptance:
        - Exports `stockKeywords: Stage<{ profile: ProfileRow;
          slot: { brief: string; kind: ImageSlotKind } },
          StockKeywordsResponse>` with `name: 'stock_keywords'`,
          `modelClass: 'fast'`, `outputSchema =
          stockKeywordsResponseSchema`.
        - System prompt instructs the model to emit 3–6 single-word
          or short-phrase English keywords suitable for Unsplash
          search (no hashtags, no quotes, no punctuation, lowercase
          preferred), reflect the brief's subject and tone, avoid
          brand names, respond with valid JSON only.
        - Calls `routeJsonChat({ class: 'fast' })`.
        - Emits `task_started` / `task_completed` with `{ stage:
          'stock_keywords' }`.
        - Unit test mocks `routeJsonChat`; asserts result passthrough;
          asserts `class: 'fast'` is forwarded.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-8: Unsplash stock provider client
      Goal: Pure HTTP client that, given keywords, queries the
      Unsplash search-photos endpoint and returns up to 6 normalized
      candidates ready for the slot's candidate list.
      Touches: `src/server/images/stock.ts`,
      `tests/unit/images/stock.test.ts`.
      Acceptance:
        - Exports `searchUnsplash(keywords: string[], opts?: { perPage?:
          number }): Promise<{ candidates: Array<{ id: string; sourceUrl:
          string; thumbUrl: string; attribution: string }> }>`.
        - Reads `process.env.UNSPLASH_ACCESS_KEY`; if missing,
          throws `class StockUnconfiguredError extends Error` (also
          exported) with message `'UNSPLASH_ACCESS_KEY not set'`.
        - Calls `https://api.unsplash.com/search/photos?query=
          <encoded keywords joined by '+'>&per_page=<perPage ?? 6>`
          with the `Authorization: Client-ID <key>` header via the
          `undici.fetch` + `getDispatcher()` pattern; surfaces a
          non-200 response as `class StockHttpError extends Error`
          (also exported) carrying the status code.
        - Maps each `result` to
          `{ id: 'unsplash_' + result.id, sourceUrl: result.urls
          .regular, thumbUrl: result.urls.small, attribution:
          'Photo by ' + result.user.name + ' on Unsplash' }`.
        - Unit test stubs `undici.fetch` (e.g. via `vi.mock(
          'undici', ...)` or by exporting an injectable
          `fetchImpl` parameter) and asserts: missing env throws
          `StockUnconfiguredError`; 200 response yields normalized
          candidates with the expected attribution string; 401
          response throws `StockHttpError` with `status === 401`.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.
      Notes: Pexels / Pixabay are out of scope here per the epic's
      decision default. Their env keys remain in `.env.example`.

- [x] T-10-9: Apply-image helper (deterministic draft insert)
      Goal: Pure persistence helper that, given a chosen candidate,
      inserts its Markdown image reference into the appropriate
      section's `section_drafts.contentMd` (inline) or prepends to
      the recomposed draft (hero), then recomposes
      `sessions.draftMd` and stamps `chosenCandidateId` on the slot.
      Touches: `src/server/pipeline/apply-image.ts`,
      `tests/unit/pipeline/apply-image.test.ts`.
      Acceptance:
        - Exports `applyImageSelection({ sessionId, userId, slotId,
          candidateId }): Promise<{ ok: true; revisedDraftMd:
          string } | { ok: false; error: 'not_found' |
          'session_invalid' | 'plan_invalid' | 'section_missing' |
          'already_chosen' }>`.
        - Resolves the session (ownership), parses `session.plan`
          via `planSchema` (errors → `plan_invalid`).
        - Loads the slot via `findSlot`; if missing → `not_found`.
          If `slot.chosenCandidateId` is already set → returns
          `already_chosen` and DOES NOT touch the draft (the v1
          UI disables re-selection; this is a defensive guard).
        - Looks up the candidate inside `slot.candidates` by
          `candidateId`; if missing → `not_found`.
        - For `kind === 'inline'`: loads `getSectionDraft(userId,
          sessionId, slot.sectionId)`; if missing →
          `section_missing`; computes `nextContentMd =
          insertParagraph(currentContentMd, slot.paragraphIndex,
          renderImageMarkdown(candidate, slot.altText ?? ''))`;
          calls `upsertSectionDraft` to persist; recomposes
          `revisedDraftMd` exactly like
          `apply-decoration.ts` (`listSectionDrafts` + plan order
          join with `'\n\n'`).
        - For `kind === 'hero'`: skips `section_drafts` entirely;
          `revisedDraftMd =
          renderImageMarkdown(candidate, slot.altText ?? '') +
          '\n\n' + composedFromSectionDrafts`.
        - Calls `updateSessionDraft(userId, sessionId,
          revisedDraftMd)` and `setSlotChoice(userId, sessionId,
          slotId, candidateId)`.
        - Returns `{ ok: true, revisedDraftMd }`.
        - Unit test mocks `getSession`, `getSectionDraft`,
          `upsertSectionDraft`, `listSectionDrafts`,
          `updateSessionDraft`, and the images repo; asserts inline
          slot inserts at the right paragraph index; asserts hero
          slot prepends; asserts `already_chosen` short-circuits;
          asserts plan order is honored.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-10: `runIllustration` orchestrator
      Goal: One-shot wrapper (analogue of `run-decoration.ts`) that
      validates the session, calls `propose_image_slots`, persists
      the resulting slots, and emits artifact events.
      Touches: `src/server/pipeline/run-illustration.ts`,
      `tests/unit/pipeline/run-illustration.test.ts`.
      Acceptance:
        - Exports `async function runIllustration({ sessionId,
          userId }): Promise<{ ok: true; slotCount: number } | {
          ok: false; error: 'session_invalid' | 'no_draft' }>`.
        - Loads `getSession`, `getProfile`, parses `planSchema`;
          returns `session_invalid` on any failure. Returns
          `no_draft` if `session.draftMd` is null/empty.
        - Builds a minimal `ctx` mirroring `run-decoration.ts`
          (real `emit`, no-op `userInput`, no-op `log.append`,
          unused `llm` placeholder).
        - Calls `proposeImageSlots.run({ profile, plan,
          sectionDrafts: await listSectionDrafts(userId,
          sessionId) }, ctx)`.
        - Materializes a `Hero` slot (`id = 's_hero_' + Date.now()`,
          `kind: 'hero'`, brief from `result.heroBrief`) plus one
          `inline` slot per `result.inlineSlots[i]`
          (`id = 's_in_' + Date.now() + '_' + i`).
        - Calls `setImageSlots(userId, sessionId, slots)`; if it
          returns `null` treats that as `session_invalid`.
        - For each persisted slot emits `artifact_updated` with
          `{ kind: 'image_slot', slot }`.
        - After the loop emits `artifact_updated` with `{ kind:
          'image_slots_round', slotCount: slots.length }`.
        - Returns `{ ok: true, slotCount: slots.length }`.
        - Unit test mocks the stage and the repo helpers; asserts
          a missing draft short-circuits to `no_draft` BEFORE the
          stage runs; asserts the happy path emits both event
          kinds and the persisted slot list contains exactly one
          hero plus the proposed inline slots; asserts re-running
          REPLACES the slot list (overwrite, not append — Epic 10
          v1 supports a single round).
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-11: Illustration server actions + slot helpers
      Goal: Server actions wiring the pane to the orchestrator,
      per-slot prompt composition, prerender, stock search,
      candidate selection, and the finish handoff.
      Touches: `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/sessions/illustration-actions.test.ts`.
      Acceptance:
        - Adds `startIllustrationAction(sessionId): Promise<{ ok:
          true; slotCount: number } | { ok: false; error: ... }>`
          that calls `requireUser` then `runIllustration({
          sessionId, userId: user.id })`; revalidates on success.
        - Adds `setSlotModeAction(sessionId, slotId, mode):
          Promise<{ ok: true; slot: ImageSlot } | { ok: false;
          error: 'validation' | 'not_found' }>` validating
          `slotId` (`z.string().min(1).max(60)`) and `mode`
          (`imageModeSchema.exclude(['undecided'])`).
        - Adds `composePromptAction(sessionId, slotId): Promise<{
          ok: true; prompt: ImagePrompt } | { ok: false; error: ... }>`
          that loads the slot, runs `composeImagePrompt`, persists
          via `setSlotPrompt`, returns the persisted prompt.
        - Adds `savePromptAction(sessionId, slotId, prompt:
          unknown): Promise<{ ok: true; prompt: ImagePrompt } |
          { ok: false; error: 'validation' | 'not_found' }>`
          validating against `imagePromptSchema`.
        - Adds `prerenderSlotAction(sessionId, slotId): Promise<{
          ok: true; candidates: ImageCandidate[] } | { ok: false;
          error: 'no_prompt' | 'not_found' | 'session_invalid' }>`
          that requires `slot.prompt`, calls
          `prerenderImages.run`, persists via
          `appendSlotCandidates`. Builds a minimal `ctx`
          (analogous to `run-illustration.ts`).
        - Adds `stockSearchAction(sessionId, slotId): Promise<{
          ok: true; candidates: ImageCandidate[] } | { ok:
          false; error: 'unconfigured' | 'http_error' |
          'not_found' }>` that runs `stockKeywords.run`, calls
          `searchUnsplash`, downloads each result via
          `saveImageFromUrl` (so the local cache stays
          self-contained), persists via `appendSlotCandidates`.
          Maps `StockUnconfiguredError` → `unconfigured`,
          `StockHttpError` → `http_error`.
        - Adds `selectCandidateAction(sessionId, slotId,
          candidateId): Promise<{ ok: true; revisedDraftMd:
          string } | { ok: false; error: ... }>` calling
          `applyImageSelection`.
        - Adds `finishIllustrationAction(sessionId): Promise<{ ok:
          true } | { ok: false; error:
          'no_pending_illustration' }>` mirroring
          `finishDecorationAction`: calls `resolveUserInput(
          sessionId, { action: 'finish' })`.
        - Unit test mocks `requireUser`, `runIllustration`,
          `composeImagePrompt`, `prerenderImages`, `stockKeywords`,
          `searchUnsplash`, `applyImageSelection`,
          `setSlotMode/Prompt`, and `resolveUserInput`; asserts
          each action threads `user.id`; asserts validation
          rejects empty `slotId`; asserts the
          `StockUnconfiguredError` mapping; asserts
          `finishIllustrationAction` returns
          `no_pending_illustration` when nothing is parked.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-12: Runner — `'illustration'` state park + transition to
      `'export'`
      Goal: When the runner enters the `'illustration'` case it
      parks for `illustration_done`; on resolve it transitions to
      `'export'`. The previous `'decoration'` case is updated so
      it kicks the runner forward into `'illustration'`.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-illustration.test.ts`.
      Acceptance:
        - The `'decoration'` case is updated to call
          `await startRunner(sessionId, userId, true)` immediately
          after transitioning to `'illustration'` (matching the
          existing `'review' → 'decoration'` chain), so the
          illustration park activates without a fresh kick.
        - A new `case 'illustration':` parks via
          `ctx.userInput('illustration_done', z.object({ action:
          z.literal('finish') }))`; on resolve calls
          `updateSessionState(userId, sessionId, 'export')`,
          emits `state_changed` (`{ state: 'export' }`), and does
          NOT recursively call `startRunner` (Epic 11 owns the
          export runner).
        - Unit test (mirrors
          `tests/unit/pipeline/runner-decoration.test.ts`) stubs
          `getSession` to return an `illustration` session and
          `updateSessionState`; drives the runner; asserts an
          `awaiting_user` event with `prompt:
          'illustration_done'` fires; calls `resolveUserInput` and
          asserts state advances to `'export'`.
        - `pnpm test`, `pnpm typecheck`, and `pnpm lint` exit 0.

- [x] T-10-13: `<IllustrationPane />` + `<ImageSlotCard />` +
      `<ImagePromptEditor />`
      Goal: Workbench pane for the `'illustration'` state with one
      card per slot, mode toggle, prompt editor (generate path),
      candidate gallery, candidate selection, and a "Finish
      illustration" button.
      Touches:
      `src/app/(app)/sessions/[id]/illustration-pane.tsx`,
      `src/app/(app)/sessions/[id]/image-slot-card.tsx`,
      `src/app/(app)/sessions/[id]/image-prompt-editor.tsx`.
      Acceptance:
        - `illustration-pane.tsx` is a `'use client'` component
          with props `{ sessionId: number; plan: Plan;
          initialState: ImageState }`. Local state mirrors
          `initialState.slots`; resyncs on `initialState`
          identity change (same pattern as `decoration-pane.tsx`).
        - Subscribes via `useSessionEvents`; on `artifact_updated`
          with `kind === 'image_slot'` upserts by `slot.id`.
        - Renders a "Run illustration proposal" button calling
          `startIllustrationAction`. Disabled while a
          `propose_image_slots` task is in flight (reuse the
          activeTasks pattern from `decoration-pane.tsx`). Hidden
          when `slots.length > 0` (the v1 flow supports one
          round).
        - Lists slots in this order: hero first, then inline slots
          in the plan's section order (sections not in plan fall
          to the tail).
        - `<ImageSlotCard>` displays for each slot: the kind pill
          ('Hero' or 'Inline — <section title>'), the brief, a
          two-button mode toggle ('Generate' / 'Stock'), the
          relevant sub-pane based on `mode`, the candidate gallery
          (4-up grid of thumbnails), and once a candidate is
          chosen, a faded "Selected" overlay on the chosen
          thumbnail (re-selection disabled in v1).
        - Generate sub-pane: shows the
          `<ImagePromptEditor />` (a controlled `<textarea>` over
          `JSON.stringify(prompt, null, 2)`, with "Compose
          prompt" → `composePromptAction`, "Save prompt" →
          `savePromptAction`, "Prerender" → `prerenderSlotAction`
          buttons). Save validates client-side via `try {
          JSON.parse(...) } catch` and shows an inline error
          before round-tripping to the server.
        - Stock sub-pane: a "Search Unsplash" button →
          `stockSearchAction`. On `error: 'unconfigured'` shows
          a static notice "Stock pathway disabled — set
          `UNSPLASH_ACCESS_KEY`."
        - Each thumbnail tile triggers `selectCandidateAction(
          sessionId, slot.id, candidate.id)`.
        - A "Finish illustration" button at the bottom calls
          `finishIllustrationAction(sessionId)`; surfaces
          `no_pending_illustration` with the same Resume button
          pattern as `decoration-pane.tsx`. Disabled until
          `slots.every(s => s.chosenCandidateId)` is true OR until
          the user explicitly skips a slot (deferred — for v1 the
          button is enabled when ALL slots have a chosen
          candidate, so a user who wants to leave a slot empty
          must reject the slot via the deferred "skip" flow; for
          v1 enable the button when `slots.length > 0` instead so
          the user is never blocked).
        - One component-level smoke test (Vitest + Testing
          Library) renders the pane with one hero slot and one
          inline slot, asserts both kind pills, the mode toggles,
          the brief text, and the "Finish illustration" button
          appear.
        - `pnpm typecheck` and `pnpm lint` exit 0.
      Notes: actually rendering generated PNGs in `<img>` tags is
      fine — the `/api/images/...` route serves them. Stock
      thumbnails point at the Unsplash CDN URLs we cached.

- [x] T-10-14: Page wiring for `'illustration'` state
      Goal: `sessions/[id]/page.tsx` mounts `<IllustrationPane />`
      when `session.state === 'illustration'`, loading the slots
      server-side.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`.
      Acceptance:
        - When `session.state === 'illustration'`, the page parses
          `planSchema` (existing fallback render on failure),
          loads `imageState = parseImageState(session.images)`,
          and mounts `<IllustrationPane sessionId={id} plan={plan}
          initialState={imageState} />` inside the workbench area,
          alongside the existing branches.
        - The fallback `<p>State: {session.state}</p>` continues
          to render for `'export' | 'done'`.
        - `pnpm typecheck` and `pnpm lint` exit 0.

- [x] T-10-15: Eval fixtures for the new LLM stages
      Goal: One captured input/expected snapshot for each of
      `propose_image_slots`, `compose_image_prompt`, and
      `stock_keywords` so the Epic 12 harness can replay them.
      Touches:
      `tests/eval/fixtures/propose_image_slots/habr-longread-1.json`,
      `tests/eval/fixtures/compose_image_prompt/habr-longread-1.json`,
      `tests/eval/fixtures/stock_keywords/habr-longread-1.json`,
      `tests/eval/README.md`,
      `tests/unit/pipeline/propose-image-slots.test.ts`,
      `tests/unit/pipeline/compose-image-prompt.test.ts`,
      `tests/unit/pipeline/stock-keywords.test.ts`.
      Acceptance:
        - Each fixture has shape `{ "input": {...}, "expected": {
          "schemaRef": "<stageExport>.outputSchema", "snapshot":
          {...} } }`. Inputs reuse the Habr long-read profile +
          plan + section drafts already seeded for earlier
          fixtures (copy from `propose_decoration` /
          `run_review`) so the chain stays consistent. Snapshots
          contain plausible values (1 hero brief + 2 inline
          slots; one full `ImagePrompt`; 4 keywords).
        - `tests/eval/README.md` table grows by three rows to
          sixteen.
        - Each of the three stage tests is extended (or, where
          freshly created in T-10-4 / T-10-5 / T-10-7, includes a
          second case) that loads the fixture, stubs
          `routeJsonChat` to return `expected.snapshot`, and
          asserts the stage's return deep-equals the snapshot.
        - `pnpm test` exits 0.
      Notes: `prerender_images` is NOT eval-fixtured — it doesn't
      route through `routeJsonChat` and image generations are
      non-deterministic.

---

## Epic 11 — Export

**Status: planned**
**Goal:** From a session in `'export'` state, the user can download the
finished article as Markdown, HTML, DOCX, or PDF — each containing the
chosen images. Markdown and HTML ship as a zip with a sidecar `images/`
folder; DOCX and PDF embed images directly. The runner advances
`'export' → 'done'` on user confirmation. Profile `markup_rules` are
honored by the HTML pipeline.

Decisions taken (defaults — change before implementation if needed):
- PDF backend: Playwright Chromium at runtime (architecture-preferred).
  The production image gets Chromium installed in T-11-2.
- HTML pipeline: `remark` + `remark-gfm` + `remark-rehype` +
  `rehype-stringify` (architecture-prescribed).
- DOCX library: `docx` (architecture-prescribed).
- Bundle archiver: `jszip` (pure JS, no native deps).
- v1 `markup_rules` fields: `{ flavor: 'standard' | 'habr',
  headingShift: integer (-2..3) }`. Existing `{}` profiles parse to
  `{ flavor: 'standard', headingShift: 0 }`.
- Stock images are always re-bundled from the local cache so a zip
  bundle is offline-usable; attribution preserved as `<sub>…</sub>`.
- Download filename pattern: `article-<sessionId>.<ext>`
  (e.g. `article-42.docx`, `article-42-md.zip`).
- Tables, footnotes, and inline raw-HTML beyond `<sub>` are out of
  scope for v1 renderers.

### Tasks

- [x] T-11-1: v1 `markup_rules` schema + parser
      Goal: Define a typed v1 schema for profile `markup_rules` with
      backward-compatible defaults so HTML / DOCX renderers can rely
      on it.
      Touches: `src/server/profiles/markup.ts`,
      `src/server/profiles/schema.ts`,
      `tests/unit/profiles/markup-schema.test.ts`.
      Acceptance:
        - `markup.ts` exports `markupRulesSchema` (zod) with shape
          `{ flavor: z.enum(['standard','habr']).default('standard'),
          headingShift: z.number().int().min(-2).max(3).default(0) }`,
          and `parseMarkupRules(value: unknown): MarkupRules` that
          returns the parsed object on success or the defaults on
          failure (mirrors `parseImageState`).
        - `profileInputSchema.markupRules` is replaced by
          `markupRulesSchema` (still optional via `.default({})` so
          existing API callers that send `{}` keep working).
        - Unit test asserts: empty object → defaults; valid full
          object round-trips; invalid `flavor` falls back to
          defaults via `parseMarkupRules`; `headingShift` outside
          range fails strict parse but `parseMarkupRules` returns
          defaults.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: no DB migration — `markupRules` jsonb column is
      unchanged; only the validation layer tightens.

- [x] T-11-2: Install export dependencies + ship Chromium in the
      production image
      Goal: Add the runtime libraries the renderers need and make
      Playwright's Chromium available inside the `runner` Docker
      stage so PDF export works in `docker compose up`.
      Touches: `package.json`, `pnpm-lock.yaml`, `Dockerfile`.
      Acceptance:
        - `pnpm add remark remark-parse remark-gfm remark-rehype
          rehype-stringify rehype-raw unified docx jszip
          playwright@1.59.1` adds them to `dependencies` (NOT
          devDependencies). The existing `@playwright/test`
          devDependency stays for e2e. `playwright` is pinned to
          the same version as `@playwright/test` so they share one
          Chromium revision.
        - The Docker base FROM is changed from `node:22-alpine` to
          `node:22-bookworm-slim` (apt-based) so Playwright's
          `--with-deps` install path works. The `addgroup`/
          `adduser` invocation is replaced with `groupadd`/
          `useradd` from the passwd package, which is the Debian-
          standard equivalent.
        - `Dockerfile`'s `runner` stage sets
          `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, then runs
          `RUN npx --yes playwright@1.59.1 install --with-deps
          chromium` (as root, before the `USER nextjs` directive).
          The browsers land in `/ms-playwright` so the unprivileged
          `nextjs` user can read them at runtime.
        - The `deps` and `builder` stages set
          `ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so the install
          step doesn't redundantly download Chromium during
          `pnpm install` (the runner stage handles that once).
        - `pnpm install --frozen-lockfile` succeeds locally.
        - `docker build -t articler-web .` succeeds.
        - `pnpm typecheck` exits 0 (so the new module typings
          resolve).
      Notes: image size will grow by ~400 MB (Debian base + apt
      deps + Chromium). Acceptable for v1.

- [x] T-11-3: Markdown article renderer + image manifest
      Goal: Produce the canonical Markdown body of the export plus a
      manifest of bundle-relative image attachments, with image
      refs rewritten from `/api/images/...` and external Unsplash
      URLs to relative `images/<slotId>.<ext>` paths.
      Touches: `src/server/export/markdown.ts`,
      `tests/unit/export/markdown.test.ts`.
      Acceptance:
        - Exports `renderMarkdownArticle({ session, imageState }: {
          session: { draftMd: string | null; id: number };
          imageState: ImageState }): Promise<{ contentMd: string;
          attachments: ImageAttachment[] }>` and the type
          `ImageAttachment = { bundlePath: string; absSourcePath:
          string; mime: 'image/png' | 'image/jpeg' | 'image/webp' }`.
        - For each slot in `imageState.slots` with a
          `chosenCandidateId`: derive the candidate's expected
          markdown URL the same way `renderImageMarkdown`
          constructs it (`localPath` for generated, `sourceUrl ??
          localPath` for stock); replace literal URL occurrences
          inside `contentMd` with `images/<slotId>.<ext>`; add an
          `ImageAttachment` whose `absSourcePath` is derived from
          `candidate.localPath` by stripping `/api/images/` and
          joining `IMAGES_ROOT`, and `mime` is inferred from the
          file extension.
        - Empty `draftMd` → `contentMd: ''`, `attachments: []`.
        - Image refs that don't match any chosen candidate are
          left untouched.
        - Unit test feeds a sample `draftMd` with one hero
          generated image ref and one inline stock ref (with
          `<sub>` attribution); asserts both URLs are rewritten,
          the `<sub>` block survives, and the manifest contains
          two attachments with the expected `bundlePath` /
          `absSourcePath` / `mime`.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: filesystem reads happen later (in T-11-7); this
      module is pure (string-in, manifest-out).

- [x] T-11-4: HTML article renderer (remark/rehype, markup-rules
      aware)
      Goal: Convert Markdown to standalone HTML applying the
      profile's `markup_rules`.
      Touches: `src/server/export/html.ts`,
      `tests/unit/export/html.test.ts`.
      Acceptance:
        - Exports `renderHtmlArticle(markdown: string, rules:
          MarkupRules): Promise<string>` that builds a `unified()`
          pipeline: `remarkParse → remarkGfm → remarkRehype({
          allowDangerousHtml: true }) → rehypeRaw → rehypeStringify`
          and returns the HTML body wrapped in a minimal
          `<!doctype html><html><head><meta charset="utf-8">
          <title>Article</title></head><body>…</body></html>`
          envelope.
        - `headingShift` is applied via a custom remark transformer:
          for each heading node, set `depth = clamp(depth +
          rules.headingShift, 1, 6)`.
        - `flavor: 'habr'` defaults `headingShift` to `+1` when the
          caller passes `0` (Habr article body uses H2 as the top
          slot; H1 is reserved for the title set by the platform),
          and wraps top-level headings in an extra newline (no
          other transformations for v1; document this as the v1
          Habr stub).
        - `flavor: 'standard'` produces clean semantic HTML with
          GFM tables disabled in DOCX/PDF (no impact here).
        - `<sub>…</sub>` blocks survive the round-trip
          (`allowDangerousHtml + rehypeRaw` enables this).
        - Unit test snapshots two cases: standard flavor with
          `headingShift: 0` over a markdown sample with H1/H2/code
          fence/list/image+`<sub>`; Habr flavor with `headingShift:
          0` over the same sample (asserts H1→H2 shift).
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: tables/footnotes intentionally rely on default GFM
      behavior; no extra config in v1.

- [x] T-11-5: DOCX article renderer
      Goal: Build a Word document from the Markdown article with
      embedded images.
      Touches: `src/server/export/docx.ts`,
      `tests/unit/export/docx.test.ts`.
      Acceptance:
        - Exports `renderDocxArticle({ contentMd, attachments,
          rules }: { contentMd: string; attachments:
          ImageAttachment[]; rules: MarkupRules }): Promise<Buffer>`.
        - Uses `unified() + remarkParse + remarkGfm` to build the
          mdast, then walks the AST mapping nodes to `docx`
          primitives:
            - `heading` → `Paragraph` with
              `HeadingLevel.HEADING_1..6` (offset by
              `rules.headingShift`, clamped 1..6).
            - `paragraph` → `Paragraph` with mixed `TextRun`s
              (bold/italic/link).
            - `list` (ordered/unordered) → `Paragraph`s with the
              relevant numbering or bullet style.
            - `code` (block) → preformatted `Paragraph` (single
              `TextRun` with `font: 'Courier New'`).
            - `blockquote` → `Paragraph` with `style: 'IntenseQuote'`
              (use `docx` built-in style).
            - `image` (`url` matches an attachment's `bundlePath`)
              → `ImageRun` reading bytes from
              `attachment.absSourcePath`; `transformation: { width:
              480, height: 270 }` for v1 (no aspect detection).
            - Unknown / unsupported nodes (table, footnote,
              raw HTML) → skipped with a single
              `Paragraph(TextRun({ text: '[unsupported: <kind>]',
              italics: true }))` placeholder so output is never
              empty for valid-looking input.
        - Unit test feeds a markdown sample (heading + paragraph
          + bullet list + image referencing a fixture PNG copied
          into a tmp dir) plus the matching attachments, calls
          `renderDocxArticle`, then:
            - asserts the buffer starts with the ZIP magic `PK\x03\x04`,
            - opens the buffer with `JSZip` and asserts it contains
              `word/document.xml` and `word/media/image1.png` (or
              similarly named entry).
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: this task adds a small fixture under
      `tests/unit/export/fixtures/` (a 1×1 PNG is fine).

- [x] T-11-6: PDF article renderer (Playwright Chromium)
      Goal: Render the HTML form of the article to PDF bytes,
      embedding images by serving them from a tmp directory.
      Touches: `src/server/export/pdf.ts`,
      `tests/unit/export/pdf.test.ts`.
      Acceptance:
        - Exports `renderPdfArticle({ html, attachments }: { html:
          string; attachments: ImageAttachment[] }): Promise<Buffer>`.
        - Implementation: `mkdtempSync` a working dir, write
          `index.html` (with a tiny embedded print stylesheet —
          system font, max-width:42rem, `img { max-width: 100%; }`),
          copy each attachment from its `absSourcePath` into the
          dir under `attachment.bundlePath` (creating
          subdirectories), launch `chromium.launch({ headless:
          true })`, open a new page, call `page.goto('file://' +
          path.join(tmpDir, 'index.html'))`, then `page.pdf({
          format: 'A4', margin: { top: '20mm', right: '15mm',
          bottom: '20mm', left: '15mm' } })`. Always close the
          browser and remove the tmp dir.
        - Unit test mocks `playwright` via `vi.mock('playwright',
          () => ({ chromium: { launch: vi.fn().mockResolvedValue(
          { newPage: vi.fn().mockResolvedValue({ goto: vi.fn(),
          pdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7'))
          }), close: vi.fn() }) } }))`; asserts the returned
          buffer starts with `%PDF-`, that `goto` was called with
          a `file://` URL inside an `os.tmpdir()` subtree, and
          that the tmp dir is cleaned up afterwards.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: real PDF rendering is not exercised in unit tests
      (no Chromium in CI). It ships in the docker image via
      T-11-2.

- [x] T-11-7: Zip bundle assembler
      Goal: Pack arbitrary files into a zip buffer; used by the
      route to ship MD/HTML bundles.
      Touches: `src/server/export/bundle.ts`,
      `tests/unit/export/bundle.test.ts`.
      Acceptance:
        - Exports `buildZipBundle(files: Array<{ path: string;
          bytes: Buffer | string }>): Promise<Buffer>` using
          `jszip`.
        - Exports `buildAttributionsReadme(attachments:
          ImageAttachment[], imageState: ImageState): string` that
          returns plain text listing each stock candidate's
          attribution (skips generated). Returns `'No external
          attributions.\n'` if none.
        - Unit test calls `buildZipBundle` with three entries
          (`article.md`, `images/hero.png`, `README.txt`), parses
          the result back with `JSZip`, and asserts all three
          entries exist with their expected payloads.
        - Second unit test calls `buildAttributionsReadme` over
          one stock + one generated slot; asserts only the stock
          line appears with its attribution string.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.

- [x] T-11-8: Export route handler
      Goal: `GET /api/sessions/:id/export?format=md|html|docx|pdf`
      returns a downloadable artifact gated by ownership and
      session state.
      Touches: `src/app/api/sessions/[id]/export/route.ts`,
      `tests/unit/api/export-route.test.ts`.
      Acceptance:
        - `requireUser` enforced; `getSession(user.id, id)` ensures
          ownership; if `session.state` is not `'export'` or
          `'done'` returns `409 { error: 'wrong_state' }`.
        - Validates `format` query param against `z.enum(['md',
          'html', 'docx', 'pdf'])`; on miss returns `400 { error:
          'bad_format' }`.
        - For all formats: load the session's profile, parse
          `markupRules` via `parseMarkupRules`, parse `imageState`
          via `parseImageState`, call `renderMarkdownArticle` to
          get `{ contentMd, attachments }`.
        - `format=md`: build a zip via `buildZipBundle` containing
          `article.md` (`contentMd`), `images/<slot>.<ext>` (read
          from `attachment.absSourcePath`), and `README.txt`
          (`buildAttributionsReadme(...)`). Response headers:
          `Content-Type: application/zip`,
          `Content-Disposition: attachment;
          filename="article-<id>-md.zip"`.
        - `format=html`: same, but the article entry is
          `article.html` produced by `renderHtmlArticle(contentMd,
          rules)`. Filename `article-<id>-html.zip`.
        - `format=docx`: call `renderDocxArticle({ contentMd,
          attachments, rules })`; respond with bytes,
          `Content-Type: application/vnd.openxmlformats-
          officedocument.wordprocessingml.document`,
          `filename="article-<id>.docx"`.
        - `format=pdf`: call `renderHtmlArticle` then
          `renderPdfArticle({ html, attachments })`; respond with
          `Content-Type: application/pdf`,
          `filename="article-<id>.pdf"`.
        - Unit test mocks `requireUser`, `getSession`,
          `getProfile`, and the four renderers; for each format
          asserts the renderer is called with the right inputs,
          the response status is 200, the content type matches,
          and the disposition filename matches the pattern.
          Negative cases: missing format → 400; wrong state → 409;
          unowned session → 404 (returned by `getSession` ⇒ null
          ⇒ route maps to 404).
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: read attachment bytes using
      `fs.readFile(attachment.absSourcePath)` inside the route
      (not in `renderMarkdownArticle`).

- [x] T-11-9: Runner — `'export'` state park + transition to
      `'done'`
      Goal: When the runner enters the `'export'` case it parks
      for `export_done`; on resolve it transitions to `'done'`.
      The previous `'illustration'` case is updated so it kicks
      the runner forward into `'export'`.
      Touches: `src/server/pipeline/runner.ts`,
      `tests/unit/pipeline/runner-export.test.ts`.
      Acceptance:
        - The `'illustration'` case is updated to call
          `await startRunner(sessionId, userId, true)` immediately
          after transitioning to `'export'` (matching the existing
          `'decoration' → 'illustration'` chain).
        - A new `case 'export':` parks via
          `ctx.userInput('export_done', z.object({ action:
          z.literal('finish') }))`; on resolve calls
          `updateSessionState(userId, sessionId, 'done')`, emits
          `state_changed` (`{ state: 'done' }`), and does NOT
          recurse into `startRunner` (`'done'` is terminal).
        - Unit test (mirrors
          `tests/unit/pipeline/runner-decoration.test.ts`) stubs
          `getSession` to return an `export` session and
          `updateSessionState`; drives the runner; asserts an
          `awaiting_user` event with `prompt: 'export_done'`
          fires; calls `resolveUserInput` and asserts state
          advances to `'done'`.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.

- [x] T-11-10: `finishExportAction` server action
      Goal: Server action the UI calls to confirm the user is
      done downloading; resolves the runner's `export_done` park.
      Touches: `src/app/(app)/sessions/[id]/actions.ts`,
      `tests/unit/sessions/finish-export-action.test.ts`.
      Acceptance:
        - Adds `finishExportAction(sessionId: number): Promise<{
          ok: true } | { ok: false; error:
          'no_pending_export' }>` mirroring `finishDecorationAction`
          / `finishIllustrationAction`: calls `requireUser`,
          asserts ownership via `getSession`, calls
          `resolveUserInput(sessionId, { action: 'finish' })`,
          maps `false` → `'no_pending_export'`.
        - Unit test mocks `requireUser`, `getSession`, and
          `resolveUserInput`; asserts ownership check rejects
          (returns `'no_pending_export'`) when `getSession`
          returns null; asserts the action threads `user.id`;
          asserts `'no_pending_export'` when `resolveUserInput`
          returns `false`; asserts `{ ok: true }` on resolve.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.

- [x] T-11-11: `<ExportPane />` + page wiring for `'export'` /
      `'done'` states
      Goal: Workbench pane for the `'export'` state with one
      download button per format and a "Mark as done" action.
      `'done'` state shows the same downloads with a banner.
      Touches:
      `src/app/(app)/sessions/[id]/export-pane.tsx`,
      `src/app/(app)/sessions/[id]/page.tsx`,
      `tests/unit/sessions/export-pane.test.tsx`.
      Acceptance:
        - `export-pane.tsx` is a `'use client'` component with
          props `{ sessionId: number; state: 'export' | 'done' }`.
        - Renders four download links — `Markdown (.zip)`,
          `HTML (.zip)`, `DOCX`, `PDF` — each as `<a download
          href={'/api/sessions/' + sessionId + '/export?format=' +
          fmt}>`.
        - When `state === 'export'`: also renders a `Mark as done`
          button calling `finishExportAction(sessionId)`; on
          `error: 'no_pending_export'` shows a "Resume" link that
          POSTs to `startSessionAction` (mirror the pattern from
          `decoration-pane.tsx`).
        - When `state === 'done'`: shows a static banner "Article
          complete." in place of the button; downloads remain
          enabled.
        - `page.tsx` mounts `<ExportPane sessionId={id}
          state={session.state} />` when `session.state ===
          'export' || session.state === 'done'`, replacing the
          existing fallback `<p>State: {session.state}</p>` for
          those two states only.
        - Component-level smoke test (Vitest + Testing Library)
          renders the pane in `state='export'`, asserts all four
          download links exist with correct `href`s, and the
          `Mark as done` button is present. Second case
          `state='done'` asserts the banner replaces the button.
        - `pnpm typecheck`, `pnpm lint`, `pnpm test` exit 0.

- [x] T-11-12: Surface render errors as JSON in the export route
      Goal: When a renderer throws (e.g. Playwright Chromium can't
      launch in dev/WSL2), the route must return a structured JSON
      error with the right status — never the raw HTML/text error
      page that the browser saves as `.txt`.
      Touches: `src/app/api/sessions/[id]/export/route.ts`,
      `tests/unit/api/export-route.test.ts`.
      Acceptance:
        - Each format branch wraps its renderer + zip calls in a
          try/catch.
        - For `format=pdf`: when the caught error message matches
          one of the Playwright-launch failure signatures
          (`browserType.launch`, `Executable doesn't exist`,
          `libnspr4`, `error while loading shared libraries`,
          `was not found`), return `503 { error:
          'pdf_unavailable', message }`. Other PDF errors fall
          through to the generic 500 path.
        - All other render failures return `500 { error:
          'render_failed', format, message }`.
        - Tests:
          - PDF renderer rejects with a Chromium-launch-shaped
            error → response 503 with `error: 'pdf_unavailable'`
            in the JSON body.
          - PDF renderer rejects with a generic error → 500 with
            `error: 'render_failed'`.
          - DOCX/HTML/MD renderer rejects → 500 with `error:
            'render_failed'` and `format` matching the request.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: do not log full stack traces in the response body;
      only the `Error.message` text. The full error stays in
      console / `appendRunLog`-style logs (out of scope here).

- [x] T-11-13: Skip empty README from md/html bundles
      Goal: When there are no external attributions, do not
      include a `README.txt` file in the zip — today the bundle
      ships a `README.txt` containing the sentinel "No external
      attributions.\n", which is noise.
      Touches: `src/app/api/sessions/[id]/export/route.ts`,
      `tests/unit/api/export-route.test.ts`.
      Acceptance:
        - In the md/html branches, call
          `buildAttributionsReadme(...)` and only push a
          `README.txt` entry when the result is NOT equal to the
          sentinel `'No external attributions.\n'`.
        - Test: empty attachments → md zip has NO `README.txt`
          entry; with at least one stock attribution → md zip
          DOES contain `README.txt`.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.

- [x] T-11-14: Hero survives subsequent inline image applies
      Goal: Selecting an inline image after a hero must NOT erase
      the hero from `draft_md`. Today `applyImageSelection` for
      inline rebuilds `draft_md` from `section_drafts` only —
      hero is gone because it was only ever inlined into the
      composed `draft_md` and never persisted into a section
      draft.
      Touches: `src/server/pipeline/apply-image.ts`,
      `tests/unit/pipeline/apply-image.test.ts`.
      Acceptance:
        - `composeFromSectionDrafts` is extended to take an
          `imageState: ImageState` argument and, after composing
          the section bodies, prepend the rendered hero image
          markdown if a `hero` slot has a `chosenCandidateId` (use
          `renderImageMarkdown` with the slot's `altText`).
        - Both inline and hero branches of `applyImageSelection`
          call this single composer; the bespoke hero branch (the
          `${imageMd}\n\n${composed}` template) is removed.
        - For the hero branch the order is: `setSlotChoice` first
          (so `imageState` reflects the new choice), THEN compose,
          THEN `updateSessionDraft`. Inline branch keeps its
          existing order but uses the new composer.
        - Tests:
          - Existing hero test still passes (`prepends hero image
            and honors plan order`).
          - New test: a hero slot already has `chosenCandidateId`
            in `imageState`; applying an inline slot produces a
            `revisedDraftMd` that contains BOTH the hero ref AND
            the inline ref.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: this fixes the bug where md/html bundles dropped
      the hero image. Markdown export logic itself
      (`renderMarkdownArticle`) does not change — once the hero
      ref is back in `draft_md`, it will be picked up.

- [x] T-11-15: Article preview on the export/done screen
      Goal: When a session reaches `'export'` or `'done'`, the
      user sees a rendered preview of the finished article on the
      same screen as the download buttons — not just a list of
      buttons.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`,
      `src/app/(app)/sessions/[id]/export-pane.tsx`,
      `tests/unit/sessions/export-pane.test.ts`.
      Acceptance:
        - `page.tsx` server-renders the article HTML for
          `state in {export, done}`: load the session's profile,
          parse `markupRules` via `parseMarkupRules`, parse
          `imageState` via `parseImageState`, call
          `renderMarkdownArticle({ session, imageState })` and
          then `renderHtmlArticle(contentMd, rules)`. Pass the
          resulting `previewHtml` string to
          `<ExportPane previewHtml={...} ... />`.
        - `<ExportPane>` accepts an optional `previewHtml: string`
          prop. When present, renders an `<iframe srcDoc={previewHtml}
          sandbox="" title="Article preview" />` in the top half
          of the pane (full width, min height ~60vh, with a
          subtle border). The download buttons + Mark as done /
          banner stay at the bottom.
        - The iframe uses `sandbox=""` (no scripts, no same-origin
          access) so the article's HTML is rendered safely; image
          refs that point at `/api/sessions/...` paths still
          resolve because the iframe inherits the parent origin
          for relative URLs (sandbox does not block image loads).
          Note: the export bundle's relative `images/<slot>.<ext>`
          refs WILL be broken inside the preview (no sidecar
          folder served) — this is fine; the in-app draft still
          uses `/api/images/...` URLs which DO resolve. The
          preview shows the in-app draft markdown, not the bundle
          markdown.
        - Existing tests still pass; one new test asserts the
          iframe with `srcDoc` is rendered when `previewHtml` is
          passed and absent otherwise.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: the preview reuses `renderMarkdownArticle` purely
      to fold the chosen images into `draft_md` (preview shows
      `/api/images/...` URLs, not bundle paths — those work in
      the iframe because the parent origin serves them).
      Decision needed: layout — top/bottom split is the simplest
      and was chosen to keep download buttons always visible
      below the fold; could be revisited.

- [x] T-11-16: Shared readable stylesheet for HTML and PDF
      Goal: The exported HTML (and the in-app preview iframe) and
      the PDF render currently look bare-browser-default, which
      is ugly. Add one shared editorial stylesheet that both
      formats use; the preview iframe and the downloaded `.html`
      pick it up automatically because they share `renderHtmlArticle`.
      Touches: `src/server/export/styles.ts`,
      `src/server/export/html.ts`, `src/server/export/pdf.ts`,
      `tests/unit/export/html.test.ts`.
      Acceptance:
        - New module `src/server/export/styles.ts` exports
          `ARTICLE_STYLESHEET: string` — a short CSS string
          covering: system-font body, ~42rem container, headings
          (h1..h6) sizing/spacing, paragraph spacing, responsive
          centred images with light corner radius, `<sub>` styled
          as a centred caption under the preceding image, links,
          `code`/`pre` (GitHub-ish background), blockquote, `hr`,
          GFM tables.
        - `renderHtmlArticle` injects `<style>${ARTICLE_STYLESHEET}
          </style>` into the document `<head>`.
        - `renderPdfArticle` replaces its local `PRINT_STYLESHEET`
          with the shared one (so in-app preview, downloaded
          `.html`, and `.pdf` look consistent).
        - HTML test asserts the style tag is present and contains
          a few load-bearing markers (e.g. `max-width:42rem`,
          `font-family`, `blockquote`).
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: kept as a single CSS string (no per-element classes
      added to the renderer) so we don't have to touch the
      remark/rehype/docx pipelines. The DOCX renderer keeps its
      own paragraph/run styling — DOCX has its own format and
      doesn't consume CSS.

- [x] T-11-17: Render images in the article preview iframe
      Goal: The preview iframe currently shows the article text
      without images: (a) `page.tsx` runs `renderMarkdownArticle`
      which rewrites image refs to bundle-relative
      `images/<slot>.<ext>` paths (no sidecar folder is served);
      (b) the iframe uses `sandbox=""` (empty), giving srcdoc an
      opaque origin so `/api/images/...` paths can't resolve
      against parent origin anyway.
      Touches: `src/app/(app)/sessions/[id]/page.tsx`,
      `src/app/(app)/sessions/[id]/export-pane.tsx`,
      `tests/unit/sessions/export-pane.test.ts`.
      Acceptance:
        - `page.tsx` no longer threads `renderMarkdownArticle`
          output into `previewHtml`. Instead it feeds the raw
          `session.draftMd` (or empty string) directly to
          `renderHtmlArticle(rawMd, rules)`. The
          `renderMarkdownArticle` import is dropped if no longer
          used here.
        - `<ExportPane>` renders the iframe with
          `sandbox="allow-same-origin"` (no `allow-scripts`,
          `allow-forms`, etc.) so srcdoc inherits the parent's
          origin and absolute `/api/images/...` paths resolve.
        - Existing iframe tests stay green; one assertion is
          updated from `sandbox=""` to
          `sandbox="allow-same-origin"`.
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: `allow-same-origin` without `allow-scripts` is safe
      — the iframe still cannot run JS or open popups; it just
      counts as same-origin so cookies and CORS see it as the
      app, which is what we need for `/api/images/`. Article
      content is the user's own draft, so the trust boundary is
      already inside the user.

- [x] T-11-18: Allow re-selecting a chosen image candidate
      Goal: Once the user picks a candidate for a slot, they
      can't change their mind — both the UI and the server reject
      it. Allow re-selection. Hero re-selection just swaps the
      chosen candidate (composer reads it from imageState). Inline
      re-selection replaces the previously-inserted image
      markdown in the section draft with the new candidate's
      markdown at the same position.
      Touches: `src/server/pipeline/apply-image.ts`,
      `src/app/(app)/sessions/[id]/actions.ts`,
      `src/app/(app)/sessions/[id]/image-slot-card.tsx`,
      `tests/unit/pipeline/apply-image.test.ts`.
      Acceptance:
        - `apply-image.ts` no longer returns `'already_chosen'`.
          The error variant is removed from the union.
        - For hero re-selection: skip the section-draft branch;
          `setSlotChoice` overwrites; composer re-runs and
          rebuilds `draft_md` with the new chosen hero.
        - For inline re-selection: locate the previously-chosen
          candidate's markdown via `renderImageMarkdown(oldCand,
          slot.altText)`; if that exact string is present in the
          current section draft, replace it with the new
          candidate's markdown (string `replace`, single
          occurrence). If not present (user manually edited),
          fall back to `insertParagraph` at the slot's stored
          `paragraphIndex`.
        - Same-candidate re-apply (user clicks the
          already-chosen tile) is a no-op for both kinds and
          returns `{ ok: true, revisedDraftMd }`.
        - `actions.ts` `selectCandidateAction` return-type union
          drops `'already_chosen'`.
        - `image-slot-card.tsx`: `handleSelect` no longer
          short-circuits when `chosenCandidateId` is set;
          `<CandidateThumb>` is disabled only for the
          currently-chosen tile (so the user can't re-click the
          one already selected, but can pick any other).
        - Tests:
          - The existing `'returns already_chosen ...'` test is
            removed.
          - New test: re-selecting a hero swaps
            `chosenCandidateId` and the composer renders the new
            URL.
          - New test: re-selecting an inline candidate produces
            a section draft whose old-image markdown is replaced
            by the new-image markdown at the same position
            (verify via `mocks.upsertSectionDraft` argument).
          - New test: re-applying the same candidate is a no-op
            (returns ok, no string replacement, no insert).
        - `pnpm test`, `pnpm typecheck`, `pnpm lint` exit 0.
      Notes: deletion-and-replacement of inline image markdown
      via string replace is fragile if the user manually edited
      the surrounding text — the fallback to `insertParagraph` at
      the original `paragraphIndex` keeps the slot reapplyable in
      that case (price: a duplicate image may end up in the
      section if the user partially edited around the old image).
      A future task could persist the inline image position
      out-of-band so the composer is the single source of truth
      for image insertion.

---

<!-- PLANING_CHECKPOINT_SKIPPED Epic 12 — replan before tackling -->

## Epic 12 — Eval harness

**Status: TBD**
Intent: `pnpm eval --stage <name> --fixture <id>` runner; rubric judge
using fast model; result JSON written under `logs/evals/`; CI workflow
gated behind an explicit env flag.

## Epic 13 — Budget enforcement (v2)

**Status: planned**
**Goal:** Move from passive cost tracking to active enforcement. Each
user has configurable spending caps (lifetime total + per-session). The
LLM router consults a pre-call guard against current cumulative spend;
if a cap is already reached, the call short-circuits with a typed
`BudgetExceededError`, the block is logged like a real run for
auditability, and a `budget_blocked` event reaches the UI. The session
header surfaces remaining budget against both caps in real time.

**Decision needed:** What window does the "user cap" cover — lifetime,
calendar-month rolling, or 30-day rolling? Default chosen: **lifetime
total** (cumulative over all `runs.cost_usd` for the user). Rationale:
simplest correct implementation; rolling-window can be added later as a
separate column without breaking the enforcement contract. The user
should confirm or override before T-13-1 is committed.

**Decision needed:** Pre-call check basis — actual cumulative spend
only, or cumulative + predicted-cost-of-this-call? Default chosen:
**cumulative-only**. Rationale: predicting per-call cost requires a
tokenizer + a `max_tokens` assumption per stage; the cumulative-only
check is mechanically simple, never under-estimates more than one call,
and matches the "running cost" model already in place. Document as a
known-imprecise behavior; revisit if any single call risks blowing past
the cap by a meaningful margin.

### Tasks

- [x] T-13-1: Add `user_settings` table with budget caps
      Goal: New table `user_settings` with one row per user storing
      `monthly_cap_usd` (nullable numeric) and `session_cap_usd`
      (nullable numeric). Nullable = "no cap". Drizzle migration
      generated and applies cleanly.
      Touches: `src/server/db/schema.ts`,
      `drizzle/00XX_<name>.sql` (new), `drizzle/meta/_journal.json`.
      Acceptance:
        - `pnpm db:generate` produces a new migration referencing
          `user_settings`.
        - `pnpm db:migrate` against the compose DB creates the table;
          re-run is a no-op.
        - `pnpm typecheck` passes with the new schema export.
      Notes: column name `monthly_cap_usd` is kept even though the
      default semantic is lifetime — see "Decision needed" above.
      Renaming later is a one-line schema change.

- [x] T-13-2: Server accessors for user settings
      Goal: `getUserSettings(userId)` returns the row (or default
      `{monthlyCapUsd: null, sessionCapUsd: null}` if absent).
      `upsertUserSettings(userId, patch)` inserts or updates; null
      values clear the cap. Both functions exported from
      `src/server/settings/budget.ts`.
      Touches: `src/server/settings/budget.ts` (new),
      `tests/unit/server/settings/budget.test.ts` (new).
      Acceptance:
        - Unit test: get on a user with no row returns the empty
          defaults.
        - Unit test: upsert then get round-trips both numeric values
          and explicit nulls (clearing).
        - `pnpm test` passes.

- [x] T-13-3: Budget settings API + page
      Goal: `GET /api/settings/budget` returns the current user's caps.
      `PUT /api/settings/budget` accepts `{monthlyCapUsd, sessionCapUsd}`
      (each `number | null`), validates with Zod, calls
      `upsertUserSettings`. New page at
      `src/app/(app)/settings/budget/page.tsx` with a form (two inputs,
      "save" button, "remove cap" toggle per field). Both endpoints go
      through the existing `requireUser` guard.
      Touches: `src/app/api/settings/budget/route.ts` (new),
      `src/app/(app)/settings/budget/page.tsx` (new),
      `src/app/(app)/settings/budget/budget-form.tsx` (new client comp),
      `tests/integration/settings/budget.test.ts` (new).
      Acceptance:
        - Integration test: PUT then GET returns the saved values
          for the same authenticated user; another user gets defaults.
        - Manual: visit `/settings/budget`, set values, reload, values
          persist.
        - `pnpm lint && pnpm typecheck && pnpm test` pass.

- [ ] T-13-4: `BudgetExceededError` + `assertBudget` pre-call guard
      Goal: New typed error class
      `BudgetExceededError extends Error` with fields
      `{scope: 'user' | 'session', spent: number, cap: number}`.
      New helper `assertBudget({userId, sessionId})` in
      `src/server/llm/budget-guard.ts` that:
        1. loads user settings,
        2. if `monthlyCapUsd != null`, calls `getUserCost(userId)` and
           throws `BudgetExceededError({scope:'user', ...})` if
           `spent >= cap`,
        3. if `sessionId != null && sessionCapUsd != null`, same check
           with `getSessionCost(sessionId)` and `scope:'session'`.
      No-op when both caps are null or when user has no settings row.
      Touches: `src/server/llm/budget-guard.ts` (new),
      `src/server/llm/errors.ts` (new or extend existing),
      `tests/unit/server/llm/budget-guard.test.ts` (new).
      Acceptance:
        - Unit test: with no cap set, `assertBudget` resolves.
        - Unit test: with `sessionCapUsd = 0.5` and mocked
          `getSessionCost` returning `0.6`, throws
          `BudgetExceededError` with `scope:'session'`.
        - Unit test: user cap takes precedence when both are exceeded
          (deterministic order — user checked first).

- [ ] T-13-5: Wire `assertBudget` into `wrapWithLogging`
      Goal: At the top of `wrapWithLogging`, before `await call()`,
      invoke `assertBudget({userId, sessionId})`. If it throws
      `BudgetExceededError`:
        - append a JSONL line with `error: true`,
          `error_kind: 'budget_blocked'`, `scope`, `spent`, `cap`,
          and the `request` (no `response`),
        - emit a `budget_blocked` event onto the session bus
          (extend `src/server/events/bus.ts` event union),
        - re-throw so callers can react.
      All existing tests for `wrapWithLogging` keep passing.
      Touches: `src/server/logging/wrap.ts`,
      `src/server/events/bus.ts`,
      `tests/unit/server/logging/wrap.test.ts` (extend),
      `tests/unit/server/logging/wrap-budget.test.ts` (new).
      Acceptance:
        - Unit test: wrap a fake call with a mocked guard that throws;
          the JSONL writer is invoked once with `error_kind:
          'budget_blocked'`, the bus emit is called once with
          `budget_blocked`, and `db.insert(runs)` is NOT called.
        - Unit test: when the guard resolves, behavior is unchanged
          (existing tests pass without modification).

- [ ] T-13-6: Remaining-budget API + session header surface
      Goal: New `GET /api/sessions/:id/budget` returns
      `{sessionSpent, sessionCap, userSpent, userCap}`. Session header
      component (`src/app/(app)/sessions/[id]/session-header.tsx` or
      equivalent — locate via `grep -rn "running cost\|stage:" src/app`)
      consumes this on mount and refreshes whenever a `cost_updated`
      or `budget_blocked` event arrives via the existing
      `use-session-events` SSE hook. Display format: `$0.42 / $1.00
      (session) · $12.30 / $50.00 (user)`; hide either segment when
      its cap is null.
      Touches: `src/app/api/sessions/[id]/budget/route.ts` (new),
      `src/app/(app)/sessions/[id]/session-header.tsx` (extend or
      create), `src/app/(app)/sessions/[id]/use-session-events.ts`,
      `tests/integration/sessions/budget-endpoint.test.ts` (new).
      Acceptance:
        - Integration test: endpoint returns correct numbers after
          inserting fixture `runs` rows and `user_settings` for that
          user.
        - Cross-user access returns 403/404 (consistent with other
          session endpoints).
        - Manual: open a session, header shows the budget line and
          updates after a stage produces a new run.

- [ ] T-13-7: End-to-end enforcement integration test
      Goal: One integration test exercises the full block path.
      Setup: create a user, set `sessionCapUsd: 0.001`, create a
      session, insert a `runs` row at cost `0.002` (mimicking prior
      spend in this session). Then call a thin wrapper that invokes
      `routeChat` through `wrapWithLogging` with a mocked OpenRouter.
      Expect: the call rejects with `BudgetExceededError`, OpenRouter
      mock is NOT invoked, JSONL contains a `budget_blocked` line,
      and the event bus saw `budget_blocked`.
      Touches: `tests/integration/llm/budget-enforcement.test.ts` (new),
      possibly small test helpers under `tests/integration/_setup/`.
      Acceptance:
        - Test passes against a real test Postgres (same harness used
          by other integration tests).
        - Test fails (proves coverage) if `assertBudget` is
          temporarily commented out of `wrapWithLogging`.

---

<!-- PLANING_CHECKPOINT -->

## Epic 14 — Ralph loop integration

**Status: TBD**
Intent: a small driver that, given the repo, decides whether to run the
planner or the implementer prompt next, executes lint/typecheck/test
between iterations, and commits on green.

## Epic 15 — Post-draft polish via sentence-level diff

**Status: TBD (design open)**
Intent: an interactive co-editor that proposes small humanization edits
at sentence granularity — short focused presets ("shorter sentences",
"kill cliches", "personal voice", "concrete over abstract", "one
rhetorical question", "break monotonous rhythm"), each ~10–30-line
prompt — and surfaces the result as a diff with per-hunk
accept / reject / edit-and-accept. Lives as an independent action,
NOT a new pipeline state. Open design questions: batch vs sequential
apply; single active variant vs many; structured JSON output from the
LLM (`[{ original, replacement, reason? }]`) so alignment between
original and rewrite is robust. Risk: LLM-driven rewriting can break
facts/numbers — must trigger fact-check after polish, AND constrain via
prompt. Reference notes in memory `project_next_session_agenda.md`.

## Epic 16 — Author voice priming at session start

**Status: TBD**
Intent: before the planning agent generates anything, ask the author
for their own opinions, lived experience, memories, attitudes about the
topic — a short free-form input that gives the article a piece of the
author's actual voice. Hypothesis: priming the smart model with the
author's own takes (even a paragraph or two) makes the resulting
drafts noticeably more alive and less generic than briefs alone.
Initial scope: optional voice-priming step between brief submission
and angle proposal; threaded into the drafting context for every
section. Test as A/B: same brief with vs. without priming.

## Epic 17 — Dictation / voice transcription

**Status: TBD**
Intent: capability to dictate any long-form input instead of typing.
Pipeline: capture audio → transcribe (whisper-class model) → fast-model
cleanup pass (remove disfluencies, repeats, false starts, light
syntactic smoothing) → editable text in the same form field. Used by
the brief, the voice-priming step (Epic 16), custom critic / polish
prompt fragments, free-form revision instructions. Cross-cutting;
worth landing as a reusable widget once and wiring into existing forms.

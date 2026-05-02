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

- [ ] T-5-9: Runner — wire real LLM into `ctx` and add `planning` orchestration
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

- [ ] T-5-10: Workbench planning UI — clarifications + angle picker
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

- [ ] T-5-11: Workbench planning UI — plan editor + lock
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

- [ ] T-5-12: Eval fixtures for `clarify_brief`, `propose_angles`, `build_plan`
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

<!-- PLANING_CHECKPOINT -->

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

# Handoff — 2026-05-04

Snapshot for the next session. Read this first, then `IMPLEMENTATION_PLAN.md` for the active epic.

## What is articler

Multi-agent writing assistant — single author, multi-platform. Next.js 15 + Postgres + Drizzle, all LLM traffic via OpenRouter. See `PRD.md` and `ARCHITECTURE.md` for the full picture.

## State right now

- Running locally via `docker compose up -d` (web on `:18080`, db on `:13036`).
- 76 commits ahead of `origin/master`, **nothing pushed**.
- Working tree clean except `.claude/scheduled_tasks.lock` and `tmp/` (both noise — do not commit).
- Test suite: **698 passed | 5 skipped** (last run: `DATABASE_URL=… pnpm test`).

## What just shipped (last burst, in order)

| Epic | What landed |
|------|-------------|
| 13 — Budget enforcement v2 | `user_settings` table, `assertBudget` guard, `BudgetExceededError`, `/settings/budget` UI, session-header budget pill (`SessionHeader` component) |
| 18 — OpenRouter `usage.cost` | Stop guessing cost from local table; trust `usage.cost`; persist `cached_tokens` + `reasoning_tokens` on `runs` |
| 19 — Stage LLM calls go through `wrapWithLogging` (runner) | AsyncLocalStorage `LLMContext`, router consults context, `withStageCtx` wraps every `stage.run()` in `runner.ts` |
| 20 — Same for non-runner orchestrators | `withStageCtx` extracted to `pipeline/with-stage-ctx.ts`, applied to `run-review` / `run-fact-check` / `run-decoration` / `run-illustration` / `apply-revisions` / `regenerate-section` / 3 sites in `actions.ts`. Plus: `wrap.ts` insert wrapped in try/catch (LLM call no longer masked by DB hiccup). E2E test now goes through `startRunner`. |
| 21 — Dashboard | Top nav (Dashboard / Profiles / Sessions / Budget), 5-card landing page (Continue working / Recent images / Spend / Profiles / Recent articles), `+ New session` CTA. Sessions/Profiles list pages got proper scroll + the sessions list now splits Active vs Finished and shows brief topic instead of `Session #id`. |

## Why all of that mattered (the real story)

A nasty pre-existing bug: `wrapWithLogging` was integration-tested, but **no stage actually called it in production** — every stage imported `routeChat` directly. Net: the `runs` table was empty for the entire project lifetime, Epic 13 enforcement was dead code, the budget header always showed 0. Epic 19 fixed runner.ts; Epic 20 found and fixed the same bug in 6 other orchestrators. Both verified end-to-end (real DB, real router, real wrap; only OpenRouter HTTP mocked).

Also discovered as a side effect: production logs need `./logs` bind-mounted into the container (commit `c477a5e`).

## Key invariants worth not breaking

- **All LLM calls flow through `wrapWithLogging`** via the AsyncLocalStorage context set in stage orchestrators (`runner.ts`, `run-*.ts`, `apply-revisions.ts`, `regenerate-section.ts`, image-flow actions). New orchestrators MUST call `withStageCtx(stage, sessionId, userId, () => stage.run(...))`. If you add a stage and skip this, it silently bypasses logging + budget enforcement.
- **`localPath` on image candidates already starts with `/api/images/`** — do not prepend the prefix again (was a real bug, see commit `766c4b2`).
- **`docker-compose.yml` bind-mounts both `./data` and `./logs`** — host uid 1001 = container nextjs uid 1001. Don't break the parity.
- **Drizzle migrations are idempotent** — running `pnpm db:migrate` twice is a no-op.
- **`monthly_cap_usd` column name vs lifetime semantic**: name kept "monthly" for forward-compat with a future rolling-window swap. Don't rename without a plan.
- **`usage.cost = 0` from OpenRouter is treated as authoritative** (free model), NOT as a parser miss → no fallback to local pricing.
- **task = stage.name (coarse)** for now. Per-LLM-call task names are a future task.

## Decisions that may bite later if forgotten

- Pre-Epic 18 `runs` rows have estimated cost (from `pricing.ts`); post-Epic 18 rows have authoritative `usage.cost`. Don't compare across the boundary blindly.
- The session-header "budget blocked" badge is sticky for the session (visible until page reload even after the cap is raised). Acceptable as v1, possible polish later.
- `cost_updated` event refresh trigger uses `events.filter(...).length` in a useEffect dep — small race possible if cost_updated bursts; AbortController would be cleaner. Non-blocking.

## Known holes / not fixed

- `prerender-images.ts` uses `ctx.llm.routeImage`. `actions.ts` already wraps the call in `withStageCtx` (T-20-4), so it logs — but the chain depends on the imageillustration ctx surface; if you refactor that surface verify it still wraps.
- No ESLint guard preventing future stages from importing `routeChat` directly. Out-of-scope choice in Epic 20; revisit if a future stage forgets `withStageCtx` and we lose telemetry again.
- Eval harness (Epic 12) is **still TBD** — explicitly skipped during planning.
- Epic 14 (Ralph loop), 15 (polish via diff), 16 (voice priming), 17 (dictation) are TBD stubs from earlier — not actively next.

## Next session's job — Epic 22

**First public deployment + CI/CD + closed registration.** Plan is in `IMPLEMENTATION_PLAN.md` at the bottom (after Epic 21).

Five tasks:
1. T-22-1: `ALLOW_REGISTRATION` env flag (default false in prod) — closes `/register`.
2. T-22-2: `pnpm tsx scripts/create-user.ts` CLI to seed users; run locally to create `user1@mail.com` and `user2@mail.com`.
3. T-22-3: GitHub Actions CI (`.github/workflows/ci.yml`) — lint + typecheck + test on every push.
4. T-22-4: `.env.production.example` + `GET /api/health` for the deploy target's healthcheck.
5. T-22-5: `docker-compose.prod.yml` + `Caddyfile` + `.github/workflows/deploy.yml` — build to GHCR, SSH-deploy onto the operator's VPS.

**Deployment target: operator's own VPS.** Image lives in GitHub Container Registry, deploy = SSH into the VPS and `docker compose pull && up -d`. Caddy in front for automatic Let's Encrypt TLS. Postgres in the same compose stack with a named volume.

**Before T-22-5 can start, the operator needs to share:**
- VPS OS + whether docker / compose plugin already installed
- Domain + DNS A-record set to the VPS
- SSH access creds (recommended: a dedicated `deploy` user without root sudo)
- Whether anything else is on the VPS (port 80/443 conflicts)

Operator wants to drive the VPS bootstrap themselves — agent gives the recipe, operator runs the commands. No live SSH access from the agent.

## Useful one-liners

```bash
# Local dev: web on 18080, db on 13036, both bind-mounted ./data and ./logs
docker compose up -d

# After any code change in (app)/ or server/
docker compose up -d --build web

# Tests
pnpm lint && pnpm typecheck && pnpm test          # unit only
DATABASE_URL=postgres://articler:articler@localhost:13036/articler pnpm test  # incl. integration

# DB
docker exec articler-db-1 psql -U articler -d articler -c '<sql>'

# Drizzle
DATABASE_URL=… pnpm db:generate    # after schema.ts edit
DATABASE_URL=… pnpm db:migrate     # apply

# Quick sanity that LLM calls are landing
docker exec articler-db-1 psql -U articler -d articler -c \
  "SELECT id, stage, model_name, cost_usd, ts FROM runs ORDER BY id DESC LIMIT 5"
tail -1 logs/runs/$(date -u +%Y-%m-%d).jsonl | python3 -m json.tool
```

## File map (the parts that change most)

- `src/server/llm/{router,context,budget-guard,pricing,openrouter}.ts` — LLM gateway.
- `src/server/logging/{wrap,jsonl,aggregate}.ts` — logging + cost.
- `src/server/pipeline/{runner,with-stage-ctx}.ts` + `pipeline/run-*.ts` + `pipeline/stages/*` — pipeline.
- `src/server/settings/budget.ts` — user budget caps accessor.
- `src/server/dashboard/data.ts` — dashboard aggregator.
- `src/app/(app)/layout.tsx`, `nav.tsx`, `dashboard/`, `sessions/`, `profiles/`, `settings/budget/` — UI.
- `IMPLEMENTATION_PLAN.md` — source of truth for what's planned and what's done.

# Articler — Architecture

## 1. Tech stack

| Concern          | Choice                                                 | Rationale                                  |
| ---------------- | ------------------------------------------------------ | ------------------------------------------ |
| Web framework    | Next.js 15 (App Router) + TS                           | UI + API in one deploy, RSC + SSE friendly |
| UI               | React 19, Tailwind, shadcn/ui                          | Fast iteration, accessible primitives      |
| Realtime         | Server-Sent Events                                     | One-way agent → UI stream is enough        |
| DB               | PostgreSQL 16                                          | JSONB for plan/brief, mature               |
| ORM / migrations | Drizzle ORM + drizzle-kit                              | Typed, lightweight, SQL-first migrations   |
| Auth             | Auth.js (credentials provider)                         | Cookie sessions, no third-party in v1      |
| LLM gateway      | OpenRouter HTTP API                                    | Single provider for text/search/image      |
| Background jobs  | In-process queue (BullMQ + Redis) deferred to Epic > 5 | Skip until needed                          |
| Logs             | Append-only JSONL on disk                              | Trivially eval-friendly                    |
| Container        | docker compose                                         | One-command boot                           |
| Tests            | Vitest (unit), Playwright (e2e), custom eval harness   | Standard JS stack                          |
| Lint/format      | ESLint + Prettier + tsc                                | Boring, fast                               |

### Why not separate API service?

v1 fits in one Next.js app: route handlers act as the API, server actions
handle mutations, SSE streams come from route handlers. We split out a
worker service only if/when long-running jobs justify it.

## 2. Service topology and ports

```
docker compose
├── web        Next.js  → host port 18080 (container 3000)
├── db         Postgres → host port 13036 (container 5432)
└── redis      (deferred — not in v1)
```

All host-exposed ports use uncommon high numbers per requirement.

## 3. Repository layout

```
articler/
├── docker-compose.yml
├── .env.example
├── package.json
├── next.config.ts
├── drizzle.config.ts
├── PRD.md
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
├── prompts/
│   ├── plan_epic.md
│   └── implement_task.md
├── src/
│   ├── app/                       # Next.js routes
│   │   ├── (auth)/                # login, register
│   │   ├── (app)/                 # authenticated UI
│   │   │   ├── profiles/
│   │   │   └── sessions/[id]/
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       ├── profiles/
│   │       ├── sessions/
│   │       └── stream/[sessionId]/    # SSE
│   ├── server/
│   │   ├── db/                    # drizzle schema + client
│   │   ├── auth/
│   │   ├── llm/                   # OpenRouter client + model router
│   │   ├── logging/               # JSONL writer + cost calc
│   │   ├── pipeline/
│   │   │   ├── stages/            # one file per stage
│   │   │   ├── events.ts          # event bus types
│   │   │   └── runner.ts          # stage orchestration
│   │   ├── images/                # gen, stock, prerender
│   │   ├── export/                # md, html, docx, pdf
│   │   └── eval/                  # eval harness (loads recorded inputs)
│   ├── shared/                    # types shared with client
│   └── components/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── eval/                      # opt-in, costs money
├── logs/                          # gitignored, JSONL
└── data/                          # gitignored, file uploads
```

## 4. Data model (initial)

```ts
users             id, email, password_hash, created_at
profiles          id, user_id, name, format, style, audience,
                  target_volume_min, target_volume_max,
                  markup_rules (jsonb), extra_prompt, created_at
sessions          id, user_id, profile_id, mode (new|rewrite),
                  state (briefing|planning|research|drafting|review
                         |decoration|illustration|export|done),
                  brief (jsonb), plan (jsonb), draft_md (text),
                  active_critics (jsonb),  -- list of critic ids enabled
                  decoration (jsonb), images (jsonb),
                  created_at, updated_at
sources           id, session_id, section_id (nullable),
                  hypothesis, query, url, title,
                  raw_excerpt, summary, relevance_score,
                  status (proposed|accepted|rejected)
critique_rounds   id, session_id, draft_hash, ts
                  -- one row per "Run review" click; groups findings
critique_findings id, round_id, critic_id, severity,
                  span (jsonb: {section_id, char_start, char_end}),
                  problem, suggested_change, rationale,
                  status (open|dismissed|applied|rewritten)
claims            id, session_id, span (jsonb), claim_text,
                  claim_type, check_worthiness,
                  span_hash  -- for idempotency on unchanged spans
claim_verdicts    id, claim_id, verdict (verified|contradicted
                                         |unverifiable|needs_caveat),
                  justification, ts
claim_evidence    id, verdict_id, source_id (nullable, → sources.id),
                  url, snippet, supports (boolean)
events            id, session_id, ts, kind, payload (jsonb)
                  -- the chat / activity log
runs              id, session_id, stage, task, model_class,
                  model_name, prompt_tokens, completion_tokens,
                  cost_usd, latency_ms, ts,
                  payload_path  -- pointer to JSONL line
```

`brief`, `plan`, `decoration`, `images` are stored as JSONB so the schema
of the agent's structured outputs can evolve without migrations.

## 5. Pipeline architecture

The pipeline is built from **stages**. Each stage is:

```ts
type Stage<I, O> = {
  name: string;
  modelClass: 'smart' | 'fast' | 'search' | 'image';
  inputSchema: ZodSchema<I>;
  outputSchema: ZodSchema<O>;
  run(input: I, ctx: StageCtx): Promise<O>;
};
```

`StageCtx` provides:

- `llm` — the model router
- `log` — the JSONL logger (auto-tagged with `session_id`, `stage`)
- `emit(event)` — push a UI-visible event onto the SSE bus
- `userInput<T>(prompt)` — pause-and-await user-side decision
  (resolved when the UI posts to a `/api/sessions/:id/respond` endpoint)

Stages, by stage of the lifecycle:

| Stage                    | Model class | Inputs                       | Outputs                  |
| ------------------------ | ----------- | ---------------------------- | ------------------------ |
| `clarify_brief`          | smart       | brief, profile               | clarifying questions     |
| `propose_angles`         | smart       | brief, profile               | 2–4 angle/method pairs   |
| `build_plan`             | smart       | angle, profile               | structured plan          |
| `plan_search_hypotheses` | smart       | plan                         | hypotheses[]             |
| `formulate_queries`      | fast        | hypothesis                   | queries[]                |
| `web_search`             | search      | query                        | search hits              |
| `summarize_source`       | fast        | hit                          | summary + relevance      |
| `draft_section`          | smart       | plan, sources, prev sections | section markdown         |
| `run_critic`             | smart       | draft + critic persona       | findings[] (per critic)  |
| `extract_claims`         | smart       | draft                        | claims[] with worthiness |
| `verify_claim`           | search      | claim + accepted sources     | evidence[]               |
| `adjudicate_claim`       | smart       | claim + evidence             | verdict + citations      |
| `propose_decoration`     | smart       | full draft                   | decoration suggestions   |
| `propose_image_slots`    | smart       | plan + draft                 | slots[]                  |
| `compose_image_prompt`   | smart       | slot context                 | structured JSON prompt   |
| `prerender_images`       | image       | image prompt                 | candidates[]             |
| `stock_keywords`         | fast        | slot context                 | keyword set              |
| `stock_search`           | (HTTP)      | keywords                     | stock candidates         |
| `export_artifact`        | (local)     | session                      | md/html/docx/pdf bytes   |

Because each stage has typed inputs/outputs and pure dependencies on
`ctx`, the eval harness can construct a minimal `StageCtx` (with a fake
LLM, a memory logger, a no-op event bus) and replay recorded inputs.

### Orchestration

`runner.ts` is a state machine over the session's `state` column. It
fires stages, persists outputs, emits events, and parks waiting for user
input. Crash-resume is naturally supported because all intermediate
artifacts live in the DB.

## 6. Model router

Config (`src/server/llm/models.ts`):

```ts
export const MODEL_ROUTING = {
  smart: { primary: 'anthropic/claude-opus-4.7', fallback: 'openai/gpt-5' },
  fast: { primary: 'anthropic/claude-haiku-4.5', fallback: 'openai/gpt-5-mini' },
  search: { primary: 'perplexity/sonar-pro' },
  image: { primary: 'google/nano-banana', secondary: 'openai/image-2' },
} as const;
```

Router responsibilities:

- pick the model for the requested class,
- format the OpenRouter request (chat, search-augmented, image),
- on transient error, retry on fallback,
- always return a `Run` record to the caller (used by the JSONL logger).

## 7. Logging and budget

Every router call goes through `wrapWithLogging(run)` which:

1. emits a JSONL line to `logs/runs/YYYY-MM-DD.jsonl`:

```json
{"ts":"2026-05-01T12:00:00Z","run_id":"r_…","user_id":"u_…",
 "session_id":"s_…","stage":"build_plan","task":"plan_v1",
 "model_class":"smart","model":"anthropic/claude-opus-4.7",
 "prompt_tokens":1834,"completion_tokens":612,"cost_usd":0.0231,
 "latency_ms":4192,
 "request":{...},"response":{...}}
```

2. inserts a thin row into `runs` (without payloads — those live in JSONL).

Cost is computed at log time from a price table per model. Sessions and
users have running totals derived by aggregation. v2 enforces caps by
short-circuiting the router on quota exceedance.

## 8. Review subsystem (critics + fact-checker)

### 8.1 Critic registry

Critics are declarative records, not code. Each critic is:

```ts
type Critic = {
  id: string; // e.g. 'editorial', 'audience_fit'
  label: string; // UI label
  systemPrompt: string; // persona + ground rules
  outputSchema: ZodSchema<Finding[]>;
  defaultEnabled: boolean;
};
```

Built-in critics: `editorial`, `audience_fit`, `methodology`, `style`,
`structure`, `headline`, `seo_discoverability`. Custom critics are
constructed at runtime by appending the user's prompt fragment to a
generic critic system prompt — they share the same `Finding[]` schema.

The `run_critic` stage is critic-agnostic: it takes a `Critic` and a
draft, produces structured findings. The `review` stage fans out
`run_critic` over the session's `active_critics` set in parallel and
aggregates results into a `critique_round`.

### 8.2 Finding schema

```ts
type Finding = {
  critic_id: string;
  severity: 'info' | 'minor' | 'major';
  span: { section_id: string; char_start: number; char_end: number };
  problem: string; // 1–2 sentences
  suggested_change: string; // concrete, not vague advice
  rationale: string; // why this matters for the profile / goal
};
```

Critics never output prose to be inserted into the draft. The only
writer to `draft_md` is the drafting agent, which the user can invoke
on a finding with "apply this suggestion to its span". This keeps the
contract clean: critics judge, drafter writes.

### 8.3 Fact-checker pipeline

Three stages, run in sequence by the orchestrator:

1. `extract_claims` — smart model. One call over the full draft,
   returning a typed `Claim[]`. Each claim carries a `span_hash` =
   sha256 of the span text; this drives idempotency.
2. `verify_claim` — search model, fanned out over claims with
   `check_worthiness in {medium, high}`. Before issuing a search,
   the stage checks the session's accepted `sources` table for a hit
   on terms drawn from the claim — already-collected evidence is
   reused for free.
3. `adjudicate_claim` — smart model, one call per claim with the
   evidence pool. Emits the `claim_verdicts` row plus per-evidence
   `claim_evidence` rows.

Idempotency: re-running fact-check skips claims whose `span_hash`
matches a verdict from the same draft revision. The user can force a
fresh run from the UI.

### 8.4 UI surface for review

The workbench pane swaps to a _review view_ split into two tabs:

- **Critique** — findings grouped by critic, each card shows severity,
  the offending span (clickable, scrolls draft to it), the suggestion,
  and three actions: dismiss / apply verbatim / send to drafter.
- **Fact-check** — claim list with verdict pills, clickable evidence
  citations, and per-claim actions: accept correction / dismiss /
  mark as opinion.

Both tabs preserve history across rounds; the chat pane streams
progress (`task_started: editorial critic`, `task_completed: 4 findings`,
etc.) the same way as any other stage.

## 9. Image subsystem

- **Structured JSON prompt** schema:

```ts
type ImagePrompt = {
  subject: string;
  style: string; // e.g. "editorial photo", "isometric vector"
  composition: string;
  palette: string[];
  lighting: string;
  camera?: string;
  mood: string;
  negative?: string;
  aspect: '16:9' | '4:3' | '1:1' | '3:4';
};
```

- **Pre-render**: for each prompt, dispatch to image model(s) producing 3–4
  candidates. Slot config decides which model is primary.
- **User selection**: candidates rendered in a chooser; one click attaches
  the chosen image to the slot.
- **Stock alternative**: parallel pathway via `stock_search` against
  Unsplash / Pexels / Pixabay (API keys from env). Same selection UI.

## 10. Export subsystem

- **Markdown**: canonical internal format — emit verbatim with embedded
  image references rewritten to local paths.
- **HTML**: `remark + rehype` pipeline; per-platform adjustments live in
  the profile's `markup_rules`.
- **DOCX**: `docx` npm package — build from the parsed Markdown AST.
- **PDF**: render the HTML via headless Chromium (Playwright already
  installed for e2e).

## 11. Realtime UI (SSE)

- One SSE endpoint per session: `GET /api/stream/:sessionId`.
- Event types: `state_changed`, `task_started`, `task_progress`,
  `task_completed`, `artifact_updated`, `cost_updated`, `agent_message`,
  `awaiting_user`.
- Client (chat pane) reduces these into a transcript view.
- `awaiting_user` events block the runner until the UI POSTs a response.

## 12. Auth

- Auth.js with credentials provider.
- Argon2id for password hashing.
- Session cookies, `Secure`, `HttpOnly`, `SameSite=lax`.
- All API handlers run a thin `requireUser(req)` guard; row-level checks
  ensure cross-user access is impossible.

## 13. Testing strategy

- **Unit**: pure functions in `server/pipeline/stages/*` — each stage gets
  unit tests with a fake `ctx.llm`.
- **Integration**: route handlers + DB; in-memory or test Postgres.
- **E2E**: Playwright walks happy-path flows in a spawned dev server
  against a seeded DB, with the LLM router stubbed.
- **Eval (opt-in)**: real model calls; replays recorded fixtures from
  `tests/eval/fixtures/<stage>/*.json` and asserts on output shape +
  rubric scores. Cost-gated by an env flag.

## 14. Eval harness

- `pnpm eval -- --stage build_plan --fixture habr-longread-1` runs the
  named stage on the named fixture.
- Each fixture is `{ input, expected: { schema?, rubric?, snapshot? } }`.
- Rubric checks use the `fast` model as a judge with a fixed prompt.
- Results are written to `logs/evals/<stage>/<run-id>.json` for diffing
  across model upgrades.

## 15. Ralph loop (future)

The two prompt files (`prompts/plan_epic.md`, `prompts/implement_task.md`)
are the manual halves of the loop. The future loop driver:

1. Reads `IMPLEMENTATION_PLAN.md`.
2. If unfinished tasks exist before the `<!-- PLANING_CHECKPOINT -->`,
   feed the next one to the implementer prompt.
3. Else feed `IMPLEMENTATION_PLAN.md` to the planner prompt to expand
   the next epic; commit; loop.
4. After every implementer iteration: run `pnpm lint && pnpm typecheck
&& pnpm test`, commit on green, revert on red.

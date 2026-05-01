# Articler — Product Requirements Document

## 1. Vision

Articler is a multi-agent writing assistant that helps a single author produce
publication-ready articles tuned to specific platforms and audiences. The
system collaborates with the user across the full lifecycle: topic discovery,
structural planning, source research, drafting/rewriting, decoration, and
illustration — and exports the result in standard formats.

The product is opinionated about _how_ good articles get written: it applies
named writing methodologies (AIDA, PAS, inverted pyramid, listicle, deep-dive,
how-to, case study, etc.) selected by the goal of the piece, rather than
generating freeform text.

## 2. Target Users

- **Primary**: solo content authors / marketers / engineers who publish on
  multiple platforms (own blog, Habr, Medium, LinkedIn, Telegram, dev.to,
  corporate CMS) with different formats per platform.
- **Operator profile**: technically literate; willing to read agent reasoning,
  approve or redirect intermediate decisions, and budget LLM spend.

## 3. Key Concepts (domain glossary)

- **User**: authenticated account.
- **Platform Profile**: reusable description of a destination
  (format, style, audience, target volume, markup rules, custom prompt
  fragments). One user has many profiles.
- **Session**: one article being produced. Bound to one platform profile.
  Has a state machine and a persistent transcript.
- **Brief**: the user's goal/topic/constraints for the session — the input.
- **Plan**: outline produced by the planning agent (topics, sub-topics,
  thesis, target reader takeaway, chosen methodology, section map).
- **Source**: external material (URL + extracted content + summary +
  relevance note) gathered during research.
- **Draft**: current article body (Markdown internal representation).
- **Decoration**: non-prose elements suggested for the draft — pull-quotes,
  callouts, code blocks, info boxes, comparison tables.
- **Illustration**: image attached to the article. May be (a) generated, or
  (b) selected from a free stock source. Each has a _role_
  (`hero` | `inline:<section_id>`).
- **Critic**: an agent persona that reads the draft and emits a structured
  critique from a single, named viewpoint (editorial, audience-fit,
  methodology adherence, style match, structural integrity, headline,
  SEO/discoverability, …). Critics propose _improvements_, not rewrites.
- **Critique finding**: one issue raised by a critic — anchored to a span
  in the draft, with a severity and a suggested change.
- **Fact-checker**: a specialized review agent (separate from critics)
  that extracts factual claims from the draft, verifies them via the
  search model, and emits a per-claim verdict with citations.
- **Run**: a single LLM call. Has model, input/output tokens, cost, latency,
  parent task, and full payload — all logged.

## 4. User Stories

1. As a user, I sign up, log in, and create a "Habr long-read" profile and a
   "LinkedIn post" profile so future sessions inherit format defaults.
2. As a user, I start a new session by picking a profile and giving a vague
   topic ("something about prompt caching"). The agent asks clarifying
   questions and proposes 3 angle/methodology pairs; I pick one.
3. As a user, I see the agent build a section-by-section plan and I can edit
   any node before approving.
4. As a user, the agent proposes "we should look up X, Y, Z" and runs
   searches. I review extracted sources and accept/reject each.
5. As a user, I paste an existing article and ask for a rewrite tuned to a
   different profile.
6. As a user, after the draft is written, I run a _review_: a panel of
   critic agents reads the draft and gives me categorized findings
   (editorial, audience-fit, methodology, style, structure). I act on
   the ones I agree with — either by hand or by asking the agent to
   apply a specific suggestion to a specific span.
7. As a user, I run the fact-checker on the draft. It lists every
   factual claim it found, each with a verdict (verified / contradicted
   / unverifiable) and citations. I decide what to amend.
8. As a user, after the draft is reviewed, the agent suggests decoration
   placements and image slots. I accept some, reject others.
9. As a user, for each image slot I get a JSON prompt I can edit, see 4
   pre-rendered candidates, pick one — or instead pick a free-stock photo.
10. As a user, I export the finished article as Markdown, HTML, DOCX, or PDF.
11. As a user, I see a running budget for the session and the cumulative
    monthly spend.
12. As a user, in the chat panel I see what the agent is currently doing
    ("searching sources… 3/5"), past steps, and intermediate artifacts.

## 5. Functional Requirements

### 5.1 Auth (FR-AUTH)

- FR-AUTH-1: Email + password registration.
- FR-AUTH-2: Session-based login with secure HTTP-only cookies.
- FR-AUTH-3: Per-user data isolation enforced at every API boundary.

### 5.2 Platform Profiles (FR-PROF)

- FR-PROF-1: CRUD for profiles. Fields:
  `name`, `format` (e.g. long-read / listicle / news / tutorial),
  `style` (tone descriptor), `audience` (free-form),
  `target_volume` (range in words),
  `markup_rules` (Markdown / HTML / platform-specific quirks),
  `extra_prompt` (free-form prompt fragment appended to system prompts).
- FR-PROF-2: Profiles are user-scoped and cannot be shared across users in v1.

### 5.3 Session lifecycle (FR-SES)

- FR-SES-1: A session has stages: `briefing → planning → research →
drafting → review → decoration → illustration → export → done`.
  The `review` stage hosts critique and fact-checking. Stages are
  re-enterable (user can go back).
- FR-SES-2: All stage transitions are persisted and visible in the chat.
- FR-SES-3: A session can be created in _rewrite_ mode by attaching one or
  more source articles to the brief.

### 5.4 Planning agent (FR-PLAN)

- FR-PLAN-1: Given a brief + profile, the smart model proposes 2–4
  _(angle, methodology)_ candidates with rationale.
- FR-PLAN-2: After selection, the smart model produces a structured plan:
  thesis, target takeaway, ordered sections each with `{title, intent,
expected_length, key_points[]}`.
- FR-PLAN-3: User can edit any field of the plan before locking it.

### 5.5 Source research (FR-SRC)

- FR-SRC-1: After planning, the system generates _search hypotheses_
  (what kind of evidence would strengthen each section).
- FR-SRC-2: Each hypothesis becomes one or more search queries, dispatched
  to the search model (Sonar Pro via OpenRouter).
- FR-SRC-3: For each result the fast model produces a short summary +
  relevance score against the originating hypothesis.
- FR-SRC-4: User accepts/rejects sources; accepted sources are attached to
  the relevant section and become available context to the drafting agent.

### 5.6 Drafting (FR-DRAFT)

- FR-DRAFT-1: The smart model writes one section at a time, given:
  profile constraints, plan, accepted sources for the section, and previous
  sections (windowed).
- FR-DRAFT-2: User can request a rewrite of any section with an instruction.
- FR-DRAFT-3: Rewrite mode: existing article is treated as draft input;
  agent applies the new profile and chosen methodology.

### 5.7 Review — critics (FR-CRIT)

- FR-CRIT-1: The user can launch a _review_ on the locked draft. Review
  runs a configurable panel of **critic personas** in parallel, each one
  evaluating the draft from a single named viewpoint:
  - `editorial` — clarity, flow, pacing, redundancy, cohesion.
  - `audience_fit` — does the language, depth, and assumed background
    match the profile's `audience` field?
  - `methodology` — does the draft actually execute the chosen
    methodology (e.g., is the AIDA structure present and proportioned)?
  - `style` — does the tone match the profile's `style`?
  - `structure` — does each section deliver on the intent declared in
    the plan? Are transitions doing real work?
  - `headline` — does the title earn the click and match the body?
  - `seo_discoverability` — surface-level signals only (terms used,
    headings, scannability); no keyword-stuffing recommendations.
- FR-CRIT-2: Each critic emits **findings** as structured items:
  `{critic, severity (info|minor|major), span (section_id + char range
or selector), problem, suggested_change, rationale}`.
- FR-CRIT-3: The set of active critics for a session is editable per
  session (default = all). The user can also write a custom critic
  prompt fragment that is appended to a generic critic system prompt
  ("ad-hoc critic").
- FR-CRIT-4: For any finding, the user can:
  - dismiss it (no change),
  - apply the suggestion verbatim,
  - or hand it to the drafting agent as a directed rewrite of the
    affected span only.
- FR-CRIT-5: Critics never edit the draft directly. The drafting agent
  is the only writer.
- FR-CRIT-6: A new round of critique can be requested after edits;
  prior rounds are preserved as history.

### 5.8 Review — fact-checker (FR-FACT)

- FR-FACT-1: The fact-checker is a separate agent (not a critic).
  It runs in three sub-stages:
  1. **Extract claims** (smart model): emit a list of factual claims
     from the draft, each with `{claim, span, claim_type
(statistic|named_entity|event|attribution|definition|other),
check_worthiness (low|medium|high)}`. Opinion, hedged, or trivially
     known statements are tagged low.
  2. **Verify** (search model): for medium/high check-worthiness
     claims, run targeted search queries; collect evidence snippets.
  3. **Adjudicate** (smart model): per claim, output verdict
     `verified | contradicted | unverifiable | needs_caveat` plus 1–N
     citations and a one-sentence justification.
- FR-FACT-2: The user is shown the claim list with verdicts, can drill
  into citations, and can:
  - accept a suggested correction (handed to the drafting agent for the
    affected span),
  - dismiss the verdict,
  - mark the claim as "intentional opinion" so future runs ignore it.
- FR-FACT-3: Sources accepted earlier (FR-SRC) are reused as evidence
  before new searches are issued; the fact-checker only fans out to the
  search model when its evidence pool is insufficient.
- FR-FACT-4: Fact-check runs are idempotent on unchanged spans — a
  claim whose span text is unchanged since its last verdict is not
  re-verified unless the user asks for a fresh run.

### 5.9 Decoration (FR-DEC)

- FR-DEC-1: After draft is complete, the smart model proposes decoration
  insertions (pull-quotes, callouts, code samples, comparison tables) at
  specific positions, with rationale.
- FR-DEC-2: User accepts/rejects each suggestion individually.

### 5.10 Illustration (FR-IMG)

- FR-IMG-1: Agent proposes image slots: one `hero` plus zero or more inline.
- FR-IMG-2: For each slot the user chooses: **generate** or **stock**.
- FR-IMG-3: Generate flow:
  - Smart model produces a _structured JSON image prompt_ (subject, style,
    composition, palette, lighting, camera, mood, negative).
  - User can edit JSON fields directly.
  - Pre-render: 3–4 candidates produced (image models — NanoBanana and
    OpenAI Image 2 — chosen per slot).
  - User picks one or requests another round.
- FR-IMG-4: Stock flow: agent generates search keywords; system queries
  free-stock APIs (Unsplash / Pexels / Pixabay); user picks one.

### 5.11 Export (FR-EXP)

- FR-EXP-1: Export the final article + chosen images as: Markdown, HTML,
  DOCX, PDF.
- FR-EXP-2: Markup rules from the platform profile are honored
  (e.g. Habr-flavored HTML).

### 5.12 Budget & logging (FR-OBS)

- FR-OBS-1: Every LLM/image/search call is logged to JSONL with:
  timestamp, user_id, session_id, stage, task, model, prompt_tokens,
  completion_tokens, cost_usd, latency_ms, request_payload, response_payload.
- FR-OBS-2: A per-session and per-user _running cost_ is computed from logs
  and displayed in the UI.
- FR-OBS-3: v1: tracking only. v2: enforce per-user / per-session limits.

### 5.13 Eval harness (FR-EVAL)

- FR-EVAL-1: Each pipeline stage is implemented as a pure function over a
  typed input → typed output (no UI coupling).
- FR-EVAL-2: A test harness can replay recorded inputs through any stage,
  assert on outputs, and compare across model swaps.

## 6. Non-Functional Requirements

- **NFR-1 (model routing)**: Four model classes are addressable by name —
  `smart`, `fast`, `search`, `image`. The mapping to concrete OpenRouter
  models lives in config and is hot-swappable.
- **NFR-2 (provider)**: All text/search/image traffic goes through
  OpenRouter. No direct provider SDKs in v1.
- **NFR-3 (logging)**: JSONL files at `logs/runs/YYYY-MM-DD.jsonl`,
  rotated daily, never overwritten.
- **NFR-4 (deployability)**: Single `docker compose up` brings up the full
  system. Public ports are uncommon high ports — UI on **18080**, Postgres
  on **13036**.
- **NFR-5 (testability)**: CI runs lint + typecheck + unit + integration
  tests. Eval suite is opt-in (cost > 0) and runs on demand.
- **NFR-6 (observability in UI)**: The chat pane streams agent state
  transitions and per-task progress in real time (SSE).
- **NFR-7 (data safety)**: Sessions and drafts are auto-saved on every
  state change.
- **NFR-8 (privacy)**: User content is not used as training data; logs
  contain prompts/completions but are local-only by default.

## 7. UI / UX Requirements

The session screen is a **two-pane layout**:

- **Left (or main) pane — workbench**: the artifact in focus depending on
  stage — the brief form, the plan tree, the source list, the draft, the
  decoration overlay, the image picker, the export panel.
- **Right pane — agent chat**: chronological transcript showing
  - user messages,
  - agent reasoning summaries,
  - task tickets ("Searching sources for §2 — 3/5 done"),
  - artifact deltas (links to the new plan version, the new draft section).

A persistent header shows the current stage and running cost.

## 8. Out of Scope (v1)

- Team/multi-user collaboration on one session.
- Direct publishing to platforms (we export, the user posts).
- Hard budget enforcement.
- Mobile app.
- Self-hosted models (everything goes through OpenRouter).
- Plagiarism / fact-check verification beyond what the search stage gives.

## 9. Success Criteria

- A user can go from "I want to write something about X for Habr" to a
  downloadable PDF in one session without leaving the app.
- Median article session cost stays under a configurable target
  (e.g. $1.00) for a long-read.
- Each pipeline stage can be invoked headlessly with recorded inputs and
  produce deterministic-enough outputs to support evals.

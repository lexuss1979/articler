import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userSettings = pgTable('user_settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  monthlyCapUsd: numeric('monthly_cap_usd', { precision: 12, scale: 6 }),
  sessionCapUsd: numeric('session_cap_usd', { precision: 12, scale: 6 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  format: text('format').notNull(),
  style: text('style').notNull(),
  audience: text('audience').notNull(),
  targetVolumeMin: integer('target_volume_min').notNull(),
  targetVolumeMax: integer('target_volume_max').notNull(),
  markupRules: jsonb('markup_rules').notNull().default({}),
  extraPrompt: text('extra_prompt').notNull().default(''),
  lightResearchSources: integer('light_research_sources').notNull().default(1),
  lightMaxWords: integer('light_max_words').notNull().default(800),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  profileId: integer('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'restrict' }),
  mode: text('mode').notNull(),
  state: text('state').notNull().default('briefing'),
  brief: jsonb('brief'),
  plan: jsonb('plan'),
  draftMd: text('draft_md'),
  draftMdPreReview: text('draft_md_pre_review'),
  revisedDraftMd: text('revised_draft_md'),
  revisionStatus: text('revision_status'),
  activeCritics: jsonb('active_critics'),
  decoration: jsonb('decoration'),
  images: jsonb('images'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    ts: timestamp('ts').defaultNow().notNull(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default({}),
  },
  (t) => [index('events_session_id_id_idx').on(t.sessionId, t.id)],
);

export const sources = pgTable(
  'sources',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    sectionId: text('section_id'),
    hypothesis: text('hypothesis').notNull(),
    query: text('query').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    rawExcerpt: text('raw_excerpt').notNull(),
    summary: text('summary').notNull().default(''),
    relevanceScore: integer('relevance_score').notNull().default(0),
    status: text('status').notNull().default('proposed'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('sources_session_id_status_idx').on(t.sessionId, t.status)],
);

export const sectionDrafts = pgTable(
  'section_drafts',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull(),
    contentMd: text('content_md').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('section_drafts_session_section_idx').on(t.sessionId, t.sectionId)],
);

export const critiqueRounds = pgTable(
  'critique_rounds',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    draftHash: text('draft_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('critique_rounds_session_id_id_idx').on(t.sessionId, t.id)],
);

export const critiqueFindings = pgTable(
  'critique_findings',
  {
    id: serial('id').primaryKey(),
    roundId: integer('round_id')
      .notNull()
      .references(() => critiqueRounds.id, { onDelete: 'cascade' }),
    criticId: text('critic_id').notNull(),
    severity: text('severity').notNull(),
    span: jsonb('span').notNull(),
    problem: text('problem').notNull(),
    suggestedChange: text('suggested_change').notNull(),
    rationale: text('rationale').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('critique_findings_round_id_id_idx').on(t.roundId, t.id)],
);

export const claims = pgTable(
  'claims',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    roundId: integer('round_id')
      .notNull()
      .references(() => critiqueRounds.id, { onDelete: 'cascade' }),
    span: jsonb('span').notNull(),
    spanHash: text('span_hash').notNull(),
    claimText: text('claim_text').notNull(),
    claimType: text('claim_type').notNull(),
    checkWorthiness: text('check_worthiness').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('claims_session_id_span_hash_idx').on(t.sessionId, t.spanHash)],
);

export const claimVerdicts = pgTable(
  'claim_verdicts',
  {
    id: serial('id').primaryKey(),
    claimId: integer('claim_id')
      .notNull()
      .references(() => claims.id, { onDelete: 'cascade' }),
    verdict: text('verdict').notNull(),
    justification: text('justification').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('claim_verdicts_claim_id_id_idx').on(t.claimId, t.id)],
);

export const claimEvidence = pgTable('claim_evidence', {
  id: serial('id').primaryKey(),
  verdictId: integer('verdict_id')
    .notNull()
    .references(() => claimVerdicts.id, { onDelete: 'cascade' }),
  sourceId: integer('source_id').references(() => sources.id, { onDelete: 'set null' }),
  url: text('url').notNull(),
  snippet: text('snippet').notNull(),
  supports: boolean('supports').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const profileAssertions = pgTable(
  'profile_assertions',
  {
    id: serial('id').primaryKey(),
    profileId: integer('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    key: text('key').notNull(),
    assertion: text('assertion').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull().default('0.5'),
    evidenceCount: integer('evidence_count').notNull().default(1),
    source: text('source').notNull().default('session'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('profile_assertions_profile_id_key_idx').on(t.profileId, t.key)],
);

export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id),
  stage: text('stage').notNull(),
  task: text('task').notNull(),
  modelClass: text('model_class').notNull(),
  modelName: text('model_name').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  cachedTokens: integer('cached_tokens'),
  reasoningTokens: integer('reasoning_tokens'),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  ts: timestamp('ts').defaultNow().notNull(),
  payloadPath: text('payload_path'),
});

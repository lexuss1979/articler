import {
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
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('section_drafts_session_section_idx').on(t.sessionId, t.sectionId)],
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
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  ts: timestamp('ts').defaultNow().notNull(),
  payloadPath: text('payload_path'),
});

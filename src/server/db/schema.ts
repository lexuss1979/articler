import { integer, jsonb, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

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

export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id'),
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

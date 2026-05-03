import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { profiles, sessions } from '../db/schema';
import type { BriefInput } from './brief';
import type { Plan } from './plan';
import type { ActiveCritics } from './critics';

export class ProfileNotOwnedError extends Error {
  constructor() {
    super('Profile not owned by user');
    this.name = 'ProfileNotOwnedError';
  }
}

export async function listSessions(userId: number) {
  return db.select().from(sessions).where(eq(sessions.userId, userId));
}

export async function getSession(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  return row ?? null;
}

export async function createSession(
  userId: number,
  input: { profileId: number; mode: 'new' | 'rewrite' },
) {
  const [owned] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, input.profileId), eq(profiles.userId, userId)));
  if (!owned) throw new ProfileNotOwnedError();

  const [row] = await db.insert(sessions).values({ ...input, userId }).returning();
  return row!;
}

export async function updateSessionState(userId: number, id: number, state: string) {
  const [row] = await db
    .update(sessions)
    .set({ state, updatedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .returning();
  return row ?? null;
}

export async function updateSessionBrief(userId: number, id: number, brief: BriefInput) {
  const [row] = await db
    .update(sessions)
    .set({ brief, updatedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .returning();
  return row ?? null;
}

export async function updateSessionPlan(userId: number, id: number, plan: Plan) {
  const [row] = await db
    .update(sessions)
    .set({ plan, updatedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .returning();
  return row ?? null;
}

export async function updateSessionDraft(userId: number, id: number, draftMd: string) {
  const [row] = await db
    .update(sessions)
    .set({ draftMd, updatedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .returning();
  return row ?? null;
}

export async function updateSessionActiveCritics(userId: number, id: number, activeCritics: ActiveCritics) {
  const [row] = await db
    .update(sessions)
    .set({ activeCritics, updatedAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .returning();
  return row ?? null;
}

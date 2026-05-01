import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { profiles } from '../db/schema';
import type { ProfileInput } from './schema';

export async function listProfiles(userId: number) {
  return db.select().from(profiles).where(eq(profiles.userId, userId));
}

export async function getProfile(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, id), eq(profiles.userId, userId)));
  return row ?? null;
}

export async function createProfile(userId: number, input: ProfileInput) {
  const [row] = await db.insert(profiles).values({ ...input, userId }).returning();
  return row!;
}

export async function updateProfile(userId: number, id: number, input: ProfileInput) {
  const [row] = await db
    .update(profiles)
    .set({ ...input })
    .where(and(eq(profiles.id, id), eq(profiles.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteProfile(userId: number, id: number) {
  await db.delete(profiles).where(and(eq(profiles.id, id), eq(profiles.userId, userId)));
}

import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '../db/client';
import { runs, sessions } from '../db/schema';
import { getUserCost } from '../logging/aggregate';
import { getUserSettings } from '../settings/budget';

function parsePositiveInt(val: string | undefined, fallback: number): number {
  if (val === undefined) return fallback;
  const n = Number(val);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

export const BATCH_CONCURRENCY = parsePositiveInt(process.env.BATCH_CONCURRENCY, 6);
export const BATCH_DAILY_SESSION_CAP = parsePositiveInt(process.env.BATCH_DAILY_SESSION_CAP, 100);
export const BATCH_DAILY_IMAGE_CAP = parsePositiveInt(process.env.BATCH_DAILY_IMAGE_CAP, 100);

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getDailySessionCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gte(sessions.createdAt, startOfTodayUtc())));
  return Number(row?.count ?? 0);
}

export async function getDailyImageCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(runs)
    .where(and(eq(runs.userId, userId), eq(runs.modelClass, 'image'), gte(runs.ts, startOfTodayUtc())));
  return Number(row?.count ?? 0);
}

type CapError = 'monthly_usd_exceeded' | 'daily_session_cap_exceeded' | 'daily_image_cap_exceeded';
type CapDetails = { current: number; cap: number; requested?: number };

export async function assertBatchCaps(
  userId: number,
  requested: number,
): Promise<{ ok: true } | { ok: false; error: CapError; details: CapDetails }> {
  const settings = await getUserSettings(userId);
  if (settings.monthlyCapUsd !== null) {
    const current = await getUserCost(userId);
    if (current >= settings.monthlyCapUsd) {
      return { ok: false, error: 'monthly_usd_exceeded', details: { current, cap: settings.monthlyCapUsd } };
    }
  }

  const dailySessions = await getDailySessionCount(userId);
  // requested=0: "at cap" means no slot for even one more (>=); requested>0: strict overflow (>)
  const sessionsBreach = requested === 0
    ? dailySessions >= BATCH_DAILY_SESSION_CAP
    : dailySessions + requested > BATCH_DAILY_SESSION_CAP;
  if (sessionsBreach) {
    return {
      ok: false,
      error: 'daily_session_cap_exceeded',
      details: { current: dailySessions, cap: BATCH_DAILY_SESSION_CAP, requested },
    };
  }

  const dailyImages = await getDailyImageCount(userId);
  const imagesBreach = requested === 0
    ? dailyImages >= BATCH_DAILY_IMAGE_CAP
    : dailyImages + requested > BATCH_DAILY_IMAGE_CAP;
  if (imagesBreach) {
    return {
      ok: false,
      error: 'daily_image_cap_exceeded',
      details: { current: dailyImages, cap: BATCH_DAILY_IMAGE_CAP, requested },
    };
  }

  return { ok: true };
}

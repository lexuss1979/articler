import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { userSettings } from '../db/schema';

export interface BudgetSettings {
  monthlyCapUsd: number | null;
  sessionCapUsd: number | null;
}

const EMPTY: BudgetSettings = { monthlyCapUsd: null, sessionCapUsd: null };

function parseCap(raw: string | null): number | null {
  if (raw === null) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export async function getUserSettings(userId: number): Promise<BudgetSettings> {
  const [row] = await db
    .select({
      monthlyCapUsd: userSettings.monthlyCapUsd,
      sessionCapUsd: userSettings.sessionCapUsd,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  if (!row) return EMPTY;
  return {
    monthlyCapUsd: parseCap(row.monthlyCapUsd),
    sessionCapUsd: parseCap(row.sessionCapUsd),
  };
}

export async function upsertUserSettings(
  userId: number,
  patch: BudgetSettings,
): Promise<void> {
  const monthly = patch.monthlyCapUsd === null ? null : String(patch.monthlyCapUsd);
  const session = patch.sessionCapUsd === null ? null : String(patch.sessionCapUsd);
  await db
    .insert(userSettings)
    .values({
      userId,
      monthlyCapUsd: monthly,
      sessionCapUsd: session,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        monthlyCapUsd: monthly,
        sessionCapUsd: session,
        updatedAt: sql`now()`,
      },
    });
}

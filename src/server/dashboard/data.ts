import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { profiles, sessions } from '../db/schema';
import { getUserCost } from '../logging/aggregate';
import { getUserSettings, type BudgetSettings } from '../settings/budget';
import { parseImageState } from '../sessions/images';

export interface DashboardActiveSession {
  id: number;
  state: string;
  mode: string;
  profileName: string;
  briefTopic: string | null;
  updatedAt: Date;
}

export interface DashboardDoneSession {
  id: number;
  profileName: string;
  briefTopic: string | null;
  updatedAt: Date;
}

export interface DashboardProfile {
  id: number;
  name: string;
  format: string;
}

export interface DashboardImage {
  sessionId: number;
  slotId: string;
  localPath: string;
  model: string | undefined;
  createdAt: string;
}

export interface DashboardData {
  active: DashboardActiveSession[];
  done: DashboardDoneSession[];
  profiles: DashboardProfile[];
  images: DashboardImage[];
  spend: { lifetime: number };
  settings: BudgetSettings;
}

const ACTIVE_LIMIT = 5;
const DONE_LIMIT = 3;
const IMAGES_LIMIT = 8;

function briefTopic(brief: unknown): string | null {
  if (brief && typeof brief === 'object' && 'topic' in brief) {
    const topic = (brief as { topic: unknown }).topic;
    if (typeof topic === 'string' && topic.length > 0) return topic;
  }
  return null;
}

function extractImagesFromSession(sessionId: number, imagesField: unknown): DashboardImage[] {
  const state = parseImageState(imagesField);
  const out: DashboardImage[] = [];
  for (const slot of state.slots) {
    if (!slot.chosenCandidateId) continue;
    const candidate = slot.candidates.find((c) => c.id === slot.chosenCandidateId);
    if (!candidate) continue;
    out.push({
      sessionId,
      slotId: slot.id,
      localPath: candidate.localPath,
      model: candidate.model,
      createdAt: candidate.createdAt,
    });
  }
  return out;
}

export async function loadDashboardData(userId: number): Promise<DashboardData> {
  const [activeRows, doneRows, profileRows, lifetime, settings, allSessionsForImages] =
    await Promise.all([
      db
        .select({
          id: sessions.id,
          state: sessions.state,
          mode: sessions.mode,
          brief: sessions.brief,
          updatedAt: sessions.updatedAt,
          profileName: profiles.name,
        })
        .from(sessions)
        .innerJoin(profiles, eq(profiles.id, sessions.profileId))
        .where(and(eq(sessions.userId, userId), ne(sessions.state, 'done')))
        .orderBy(desc(sessions.updatedAt))
        .limit(ACTIVE_LIMIT),

      db
        .select({
          id: sessions.id,
          brief: sessions.brief,
          updatedAt: sessions.updatedAt,
          profileName: profiles.name,
        })
        .from(sessions)
        .innerJoin(profiles, eq(profiles.id, sessions.profileId))
        .where(and(eq(sessions.userId, userId), eq(sessions.state, 'done')))
        .orderBy(desc(sessions.updatedAt))
        .limit(DONE_LIMIT),

      db
        .select({ id: profiles.id, name: profiles.name, format: profiles.format })
        .from(profiles)
        .where(eq(profiles.userId, userId)),

      getUserCost(userId),
      getUserSettings(userId),

      db
        .select({ id: sessions.id, images: sessions.images })
        .from(sessions)
        .where(eq(sessions.userId, userId)),
    ]);

  const allImages = allSessionsForImages.flatMap((s) => extractImagesFromSession(s.id, s.images));
  allImages.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const images = allImages.slice(0, IMAGES_LIMIT);

  return {
    active: activeRows.map((r) => ({
      id: r.id,
      state: r.state,
      mode: r.mode,
      profileName: r.profileName,
      briefTopic: briefTopic(r.brief),
      updatedAt: r.updatedAt,
    })),
    done: doneRows.map((r) => ({
      id: r.id,
      profileName: r.profileName,
      briefTopic: briefTopic(r.brief),
      updatedAt: r.updatedAt,
    })),
    profiles: profileRows,
    images,
    spend: { lifetime },
    settings,
  };
}

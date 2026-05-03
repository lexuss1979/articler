import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import {
  parseImageState,
  type ImageCandidate,
  type ImagePrompt,
  type ImageSlot,
  type ImageState,
} from './images';
import { getSession } from './repo';

export async function getImageState(
  userId: number,
  sessionId: number,
): Promise<ImageState> {
  const session = await getSession(userId, sessionId);
  if (!session) return { slots: [] };
  return parseImageState(session.images);
}

export async function setImageSlots(
  userId: number,
  sessionId: number,
  slots: ImageSlot[],
): Promise<ImageSlot[] | null> {
  const [row] = await db
    .update(sessions)
    .set({ images: { slots }, updatedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning();
  return row ? slots : null;
}

export async function findSlot(
  userId: number,
  sessionId: number,
  slotId: string,
): Promise<ImageSlot | null> {
  const session = await getSession(userId, sessionId);
  if (!session) return null;
  const state = parseImageState(session.images);
  return state.slots.find((s) => s.id === slotId) ?? null;
}

export async function updateSlot(
  userId: number,
  sessionId: number,
  slotId: string,
  mutator: (slot: ImageSlot) => ImageSlot,
): Promise<ImageSlot | null> {
  const session = await getSession(userId, sessionId);
  if (!session) return null;
  const state = parseImageState(session.images);
  const idx = state.slots.findIndex((s) => s.id === slotId);
  if (idx < 0) return null;
  const next = mutator(state.slots[idx]!);
  const newSlots = [...state.slots];
  newSlots[idx] = next;
  const [row] = await db
    .update(sessions)
    .set({ images: { slots: newSlots }, updatedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning();
  return row ? next : null;
}

export function setSlotMode(
  userId: number,
  sessionId: number,
  slotId: string,
  mode: 'generate' | 'stock',
): Promise<ImageSlot | null> {
  return updateSlot(userId, sessionId, slotId, (slot) => ({ ...slot, mode }));
}

export function setSlotPrompt(
  userId: number,
  sessionId: number,
  slotId: string,
  prompt: ImagePrompt,
): Promise<ImageSlot | null> {
  return updateSlot(userId, sessionId, slotId, (slot) => ({ ...slot, prompt }));
}

export function appendSlotCandidates(
  userId: number,
  sessionId: number,
  slotId: string,
  candidates: ImageCandidate[],
): Promise<ImageSlot | null> {
  return updateSlot(userId, sessionId, slotId, (slot) => ({
    ...slot,
    candidates: [...slot.candidates, ...candidates],
  }));
}

export async function setSlotChoice(
  userId: number,
  sessionId: number,
  slotId: string,
  candidateId: string,
): Promise<ImageSlot | null> {
  const session = await getSession(userId, sessionId);
  if (!session) return null;
  const state = parseImageState(session.images);
  const idx = state.slots.findIndex((s) => s.id === slotId);
  if (idx < 0) return null;
  const slot = state.slots[idx]!;
  if (!slot.candidates.some((c) => c.id === candidateId)) return null;
  const next: ImageSlot = { ...slot, chosenCandidateId: candidateId };
  const newSlots = [...state.slots];
  newSlots[idx] = next;
  const [row] = await db
    .update(sessions)
    .set({ images: { slots: newSlots }, updatedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning();
  return row ? next : null;
}

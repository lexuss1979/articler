import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import {
  parseDecorationState,
  type DecorationRound,
  type DecorationState,
  type DecorationSuggestion,
  type ProposeDecorationResponse,
} from './decoration';
import { getSession } from './repo';

export async function getDecorationState(
  userId: number,
  sessionId: number,
): Promise<DecorationState> {
  const session = await getSession(userId, sessionId);
  if (!session) return { rounds: [] };
  return parseDecorationState(session.decoration);
}

export async function appendDecorationRound(
  userId: number,
  sessionId: number,
  round: { draftHash: string; suggestions: ProposeDecorationResponse['suggestions'] },
): Promise<DecorationRound | null> {
  const session = await getSession(userId, sessionId);
  if (!session) return null;

  const state = parseDecorationState(session.decoration);
  const roundId = 'r_' + Date.now() + '_' + randomBytes(4).toString('hex');
  const suggestions: DecorationSuggestion[] = round.suggestions.map((s, i) => ({
    ...s,
    id: 's_' + roundId + '_' + i,
    status: 'proposed' as const,
  }));
  const newRound: DecorationRound = {
    id: roundId,
    draftHash: round.draftHash,
    createdAt: new Date().toISOString(),
    suggestions,
  };
  const newState: DecorationState = { rounds: [...state.rounds, newRound] };

  const [row] = await db
    .update(sessions)
    .set({ decoration: newState, updatedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning();
  return row ? newRound : null;
}

export async function findSuggestion(
  userId: number,
  sessionId: number,
  suggestionId: string,
): Promise<{ round: DecorationRound; suggestion: DecorationSuggestion } | null> {
  const session = await getSession(userId, sessionId);
  if (!session) return null;
  const state = parseDecorationState(session.decoration);
  for (const round of state.rounds) {
    const suggestion = round.suggestions.find((s) => s.id === suggestionId);
    if (suggestion) return { round, suggestion };
  }
  return null;
}

export async function setSuggestionStatus(
  userId: number,
  sessionId: number,
  suggestionId: string,
  status: 'accepted' | 'rejected',
): Promise<DecorationSuggestion | null> {
  const session = await getSession(userId, sessionId);
  if (!session) return null;

  const state = parseDecorationState(session.decoration);
  let updated: DecorationSuggestion | null = null;
  const newRounds: DecorationRound[] = state.rounds.map((round) => ({
    ...round,
    suggestions: round.suggestions.map((s) => {
      if (s.id !== suggestionId) return s;
      const next: DecorationSuggestion = { ...s, status };
      updated = next;
      return next;
    }),
  }));
  if (!updated) return null;

  const [row] = await db
    .update(sessions)
    .set({ decoration: { rounds: newRounds }, updatedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning();
  return row ? updated : null;
}

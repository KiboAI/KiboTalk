import type {
  ConversationPauseReason,
  ConversationReviewUpdate,
  ConversationSession,
  ConversationSessionStart,
  ConversationTurn,
  ReplyCandidate,
} from './types'

/**
 * Durable conversation storage. Pipeline-facing methods keep the active turn
 * log small while product shells use the lifecycle/history methods.
 */
export interface ConversationStorage {
  startSession(session: ConversationSessionStart): Promise<ConversationSession>
  appendTurn(turn: ConversationTurn): Promise<void>
  updateTurnSuggestions(turnId: string, suggestions: ReplyCandidate[]): Promise<void>
  loadActiveSession(): Promise<ConversationTurn[] | null>
  getActiveSession(): Promise<ConversationSession | null>
  pauseActiveSession(reason: ConversationPauseReason, pausedAt?: number): Promise<ConversationSession | null>
  resumeActiveSession(resumedAt?: number): Promise<ConversationSession | null>
  stopActiveSession(endedAt?: number): Promise<ConversationSession | null>
  clearActiveSession(): Promise<void>
  listSessions(): Promise<ConversationSession[]>
  loadSession(sessionId: string): Promise<ConversationSession | null>
  upsertSession(session: ConversationSession): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  updateSessionReview(sessionId: string, update: ConversationReviewUpdate): Promise<void>
  clearHistory(): Promise<void>
}

/** Optional durable metadata used by the mandatory cloud-sync adapter. */
export interface ConversationSyncMetadataStorage {
  markSessionDirty(sessionId: string): Promise<void>
  clearSessionDirty(sessionId: string): Promise<void>
  listDirtySessionIds(): Promise<string[]>
  setPendingPreferences(preferences: unknown): Promise<void>
  loadPendingPreferences(): Promise<unknown | null>
  clearPendingPreferences(): Promise<void>
}

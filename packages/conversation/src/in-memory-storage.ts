import type { ConversationStorage } from './storage'
import type {
  ConversationPauseReason,
  ConversationReviewUpdate,
  ConversationSession,
  ConversationSessionStart,
  ConversationTurn,
  ReplyCandidate,
} from './types'

export class InMemoryConversationStorage implements ConversationStorage {
  private sessions = new Map<string, ConversationSession>()
  private activeSessionId: string | null = null

  async startSession(start: ConversationSessionStart): Promise<ConversationSession> {
    const session: ConversationSession = {
      ...start,
      status: 'running',
      pausedDurationMs: 0,
      turns: [],
      reviewStatus: 'pending',
    }
    this.sessions.set(session.id, session)
    this.activeSessionId = session.id
    return cloneSession(session)
  }

  async appendTurn(turn: ConversationTurn): Promise<void> {
    const session = this.activeSession()
    if (!session) {
      const implicit = await this.startSession({
        id: 'active',
        relayNodeId: 'jp-primary',
        startedAt: turn.startedAt,
        title: '',
        snapshot: {
          conversationLang: 'ja',
          meaningLang: 'zh',
          uiLang: 'zh',
          level: 'beginner',
          audioSource: 'microphone',
          microphoneDeviceId: 'default',
        },
      })
      this.sessions.set(implicit.id, { ...implicit, turns: [turn] })
      return
    }
    session.turns.push(turn)
  }

  async updateTurnSuggestions(turnId: string, suggestions: ReplyCandidate[]): Promise<void> {
    const session = this.activeSession()
    if (!session) return
    session.turns = session.turns.map((turn) =>
      turn.id === turnId ? { ...turn, suggestions: [...suggestions] } : turn,
    )
  }

  async loadActiveSession(): Promise<ConversationTurn[] | null> {
    const turns = this.activeSession()?.turns ?? []
    return turns.length === 0 ? null : structuredClone(turns)
  }

  async getActiveSession(): Promise<ConversationSession | null> {
    const session = this.activeSession()
    return session ? cloneSession(session) : null
  }

  async pauseActiveSession(
    reason: ConversationPauseReason,
    pausedAt = Date.now(),
  ): Promise<ConversationSession | null> {
    const session = this.activeSession()
    if (!session || session.status === 'stopped') return null
    session.status = 'paused'
    session.pausedAt = pausedAt
    session.pauseReason = reason
    return cloneSession(session)
  }

  async resumeActiveSession(resumedAt = Date.now()): Promise<ConversationSession | null> {
    const session = this.activeSession()
    if (!session || session.status !== 'paused') return null
    session.pausedDurationMs += Math.max(0, resumedAt - (session.pausedAt ?? resumedAt))
    session.status = 'running'
    delete session.pausedAt
    delete session.pauseReason
    return cloneSession(session)
  }

  async stopActiveSession(endedAt = Date.now()): Promise<ConversationSession | null> {
    const session = this.activeSession()
    if (!session) return null
    if (session.status === 'paused') {
      session.pausedDurationMs += Math.max(0, endedAt - (session.pausedAt ?? endedAt))
    }
    session.status = 'stopped'
    session.endedAt = endedAt
    delete session.pausedAt
    delete session.pauseReason
    this.activeSessionId = null
    return cloneSession(session)
  }

  async clearActiveSession(): Promise<void> {
    if (this.activeSessionId) this.sessions.delete(this.activeSessionId)
    this.activeSessionId = null
  }

  async listSessions(): Promise<ConversationSession[]> {
    return [...this.sessions.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(cloneSession)
  }

  async loadSession(sessionId: string): Promise<ConversationSession | null> {
    const session = this.sessions.get(sessionId)
    return session ? cloneSession(session) : null
  }

  async upsertSession(session: ConversationSession): Promise<void> {
    this.sessions.set(session.id, cloneSession(session))
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
    if (this.activeSessionId === sessionId) this.activeSessionId = null
  }

  async updateSessionReview(sessionId: string, update: ConversationReviewUpdate): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    Object.assign(session, update)
  }

  async clearHistory(): Promise<void> {
    const active = this.activeSession()
    this.sessions.clear()
    if (active) this.sessions.set(active.id, active)
  }

  private activeSession(): ConversationSession | null {
    return this.activeSessionId ? (this.sessions.get(this.activeSessionId) ?? null) : null
  }
}

function cloneSession(session: ConversationSession): ConversationSession {
  return structuredClone(session)
}

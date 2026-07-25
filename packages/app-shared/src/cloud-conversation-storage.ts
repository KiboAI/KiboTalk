import type {
  ConversationPauseReason,
  ConversationReviewUpdate,
  ConversationSession,
  ConversationSessionStart,
  ConversationStorage,
  ConversationSyncMetadataStorage,
  ConversationTurn,
  ReplyCandidate,
} from '@kibotalk/conversation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { authorizedFetch } from './api-runtime'

type SyncResponse = {
  cursor: number
  sessions: Array<{ session: ConversationSession; version: number }>
  deletedSessionIds: Array<{ id: string; version: number }>
  preferences: { value: unknown; version: number } | null
}

function syncMetadataStorage(
  storage: ConversationStorage,
): ConversationSyncMetadataStorage | null {
  const candidate = storage as Partial<ConversationSyncMetadataStorage>
  const implementsSyncMetadata = (
    typeof candidate.markSessionDirty === 'function'
    && typeof candidate.clearSessionDirty === 'function'
    && typeof candidate.listDirtySessionIds === 'function'
    && typeof candidate.setPendingPreferences === 'function'
    && typeof candidate.loadPendingPreferences === 'function'
    && typeof candidate.clearPendingPreferences === 'function'
  )
  return implementsSyncMetadata ? candidate as ConversationSyncMetadataStorage : null
}

/**
 * Local-first storage with mandatory, automatic text sync. Every mutation is
 * durable in IndexedDB first, then serialized to the encrypted server store.
 * Audio and speaker embeddings never enter this adapter.
 */
export class CloudConversationStorage implements ConversationStorage {
  private remoteQueue = Promise.resolve()
  private readonly abortController = new AbortController()
  private readonly metadata: ConversationSyncMetadataStorage | null
  private readonly dirtyFallback = new Set<string>()
  private pendingPreferencesFallback: unknown | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryDelayMs = 2_000
  private preferencesRevision = 0
  private disposed = false

  constructor(
    private readonly local: ConversationStorage,
    private readonly userId: string,
    private readonly onSyncError: (error: string) => void = () => undefined,
  ) {
    this.metadata = syncMetadataStorage(local)
  }

  async initialize(): Promise<unknown | null> {
    const response = await authorizedFetch('/api/sync?since=0', {
      headers: this.syncHeaders(),
      signal: this.abortController.signal,
    })
    const body = (await response.json().catch(() => ({}))) as Partial<SyncResponse> & {
      error?: string
    }
    if (!response.ok) throw new Error(body.error ?? `Sync HTTP ${response.status}`)
    const localSessions = new Map(
      (await this.local.listSessions()).map((session) => [session.id, session]),
    )
    const dirtySessionIds = new Set(await this.listDirtySessionIds())
    const remoteIds = new Set<string>()
    for (const item of body.sessions ?? []) {
      remoteIds.add(item.session.id)
      const dirtyLocal = localSessions.get(item.session.id)
      if (dirtyLocal && dirtySessionIds.has(item.session.id)) {
        this.enqueue(() => this.pushSession(dirtyLocal))
        continue
      }
      await this.local.upsertSession(item.session)
    }
    for (const deleted of body.deletedSessionIds ?? []) {
      remoteIds.add(deleted.id)
      const dirtyLocal = localSessions.get(deleted.id)
      if (dirtyLocal && dirtySessionIds.has(deleted.id)) {
        this.enqueue(() => this.pushSession(dirtyLocal))
        continue
      }
      await this.local.deleteSession(deleted.id)
    }
    for (const session of localSessions.values()) {
      if (remoteIds.has(session.id)) continue
      await this.markSessionDirty(session.id)
      this.enqueue(() => this.pushSession(session))
    }
    const pendingPreferences = await this.loadPendingPreferences()
    if (pendingPreferences !== null) {
      const revision = ++this.preferencesRevision
      this.enqueue(() => this.pushPreferences(pendingPreferences, revision))
      return pendingPreferences
    }
    return body.preferences?.value ?? null
  }

  dispose(): void {
    this.disposed = true
    this.abortController.abort()
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  async flush(): Promise<void> {
    await this.remoteQueue
  }

  async updatePreferences(preferences: unknown): Promise<void> {
    this.pendingPreferencesFallback = preferences
    await this.metadata?.setPendingPreferences(preferences)
    const revision = ++this.preferencesRevision
    this.enqueue(() => this.pushPreferences(preferences, revision))
  }

  async startSession(start: ConversationSessionStart): Promise<ConversationSession> {
    const session = await this.local.startSession(start)
    await this.markSessionDirty(start.id)
    this.enqueue(() => this.pushSession(session))
    return session
  }

  async appendTurn(turn: ConversationTurn): Promise<void> {
    await this.local.appendTurn(turn)
    await this.queueActiveSession()
  }

  async updateTurnSuggestions(turnId: string, suggestions: ReplyCandidate[]): Promise<void> {
    await this.local.updateTurnSuggestions(turnId, suggestions)
    await this.queueActiveSession()
  }

  loadActiveSession(): Promise<ConversationTurn[] | null> {
    return this.local.loadActiveSession()
  }

  getActiveSession(): Promise<ConversationSession | null> {
    return this.local.getActiveSession()
  }

  async pauseActiveSession(
    reason: ConversationPauseReason,
    pausedAt?: number,
  ): Promise<ConversationSession | null> {
    const session = await this.local.pauseActiveSession(reason, pausedAt)
    if (session) {
      await this.markSessionDirty(session.id)
      this.enqueue(() => this.pushSession(session))
    }
    return session
  }

  async resumeActiveSession(resumedAt?: number): Promise<ConversationSession | null> {
    const session = await this.local.resumeActiveSession(resumedAt)
    if (session) {
      await this.markSessionDirty(session.id)
      this.enqueue(() => this.pushSession(session))
    }
    return session
  }

  async stopActiveSession(endedAt?: number): Promise<ConversationSession | null> {
    const session = await this.local.stopActiveSession(endedAt)
    if (session) {
      await this.markSessionDirty(session.id)
      this.enqueue(() => this.pushSession(session))
    }
    return session
  }

  async clearActiveSession(): Promise<void> {
    const active = await this.local.getActiveSession()
    if (active) await this.deleteRemoteSession(active.id)
    await this.local.clearActiveSession()
    if (active) await this.clearSessionDirty(active.id)
  }

  listSessions(): Promise<ConversationSession[]> {
    return this.local.listSessions()
  }

  loadSession(sessionId: string): Promise<ConversationSession | null> {
    return this.local.loadSession(sessionId)
  }

  async upsertSession(session: ConversationSession): Promise<void> {
    await this.markSessionDirty(session.id)
    await this.local.upsertSession(session)
    this.enqueue(() => this.pushSession(session))
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.deleteRemoteSession(sessionId)
    await this.local.deleteSession(sessionId)
    await this.clearSessionDirty(sessionId)
  }

  async updateSessionReview(
    sessionId: string,
    update: ConversationReviewUpdate,
  ): Promise<void> {
    await this.markSessionDirty(sessionId)
    await this.local.updateSessionReview(sessionId, update)
    const session = await this.local.loadSession(sessionId)
    if (session) this.enqueue(() => this.pushSession(session))
  }

  async clearHistory(): Promise<void> {
    const response = await authorizedFetch('/api/sync/history', {
      method: 'DELETE',
      headers: this.syncHeaders(),
      signal: this.abortController.signal,
    })
    if (!response.ok) throw new Error(`Clear sync history HTTP ${response.status}`)
    await this.local.clearHistory()
    await this.clearDirtyMarkersWithoutSessions()
  }

  private async queueActiveSession(): Promise<void> {
    const session = await this.local.getActiveSession()
    if (session) {
      await this.markSessionDirty(session.id)
      this.enqueue(() => this.pushSession(session))
    }
  }

  private enqueue(operation: () => Promise<void>): void {
    this.remoteQueue = this.remoteQueue
      .then(async () => {
        if (!this.disposed) {
          await operation()
          this.onSyncError('')
        }
      })
      .catch((cause) => {
        if (!this.disposed) {
          this.onSyncError(cause instanceof Error ? cause.message : String(cause))
          this.scheduleRetry()
        }
      })
  }

  private async pushSession(session: ConversationSession): Promise<void> {
    const response = await authorizedFetch(
      `/api/sync/sessions/${encodeURIComponent(session.id)}`,
      {
        method: 'PUT',
        headers: this.syncHeaders(true),
        body: JSON.stringify({ session }),
        signal: this.abortController.signal,
      },
    )
    if (!response.ok) throw new Error(`Session sync HTTP ${response.status}`)
    await this.clearSessionDirty(session.id)
    this.retryDelayMs = 2_000
  }

  private async deleteRemoteSession(sessionId: string): Promise<void> {
    const response = await authorizedFetch(
      `/api/sync/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'DELETE',
        headers: this.syncHeaders(),
        signal: this.abortController.signal,
      },
    )
    if (!response.ok) throw new Error(`Session delete sync HTTP ${response.status}`)
  }

  private async pushPreferences(preferences: unknown, revision: number): Promise<void> {
    const response = await authorizedFetch('/api/sync/preferences', {
      method: 'PUT',
      headers: this.syncHeaders(true),
      body: JSON.stringify({ preferences }),
      signal: this.abortController.signal,
    })
    if (!response.ok) throw new Error(`Preferences sync HTTP ${response.status}`)
    if (revision === this.preferencesRevision) {
      await this.clearPendingPreferences()
    }
    this.retryDelayMs = 2_000
  }

  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer) return
    const delay = this.retryDelayMs
    this.retryDelayMs = Math.min(30_000, this.retryDelayMs * 2)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.retryDirtyData().catch(() => this.scheduleRetry())
    }, delay)
  }

  private async retryDirtyData(): Promise<void> {
    if (this.disposed) return
    for (const sessionId of await this.listDirtySessionIds()) {
      const session = await this.local.loadSession(sessionId)
      if (session) this.enqueue(() => this.pushSession(session))
      else await this.clearSessionDirty(sessionId)
    }
    const preferences = await this.loadPendingPreferences()
    if (preferences !== null) {
      const revision = ++this.preferencesRevision
      this.enqueue(() => this.pushPreferences(preferences, revision))
    }
  }

  private async clearDirtyMarkersWithoutSessions(): Promise<void> {
    for (const sessionId of await this.listDirtySessionIds()) {
      if (!await this.local.loadSession(sessionId)) {
        await this.clearSessionDirty(sessionId)
      }
    }
  }

  private async markSessionDirty(sessionId: string): Promise<void> {
    this.dirtyFallback.add(sessionId)
    await this.metadata?.markSessionDirty(sessionId)
  }

  private async clearSessionDirty(sessionId: string): Promise<void> {
    this.dirtyFallback.delete(sessionId)
    await this.metadata?.clearSessionDirty(sessionId)
  }

  private async listDirtySessionIds(): Promise<string[]> {
    const persisted = await this.metadata?.listDirtySessionIds() ?? []
    return [...new Set([...persisted, ...this.dirtyFallback])]
  }

  private async loadPendingPreferences(): Promise<unknown | null> {
    const persisted = await this.metadata?.loadPendingPreferences()
    return persisted ?? this.pendingPreferencesFallback
  }

  private async clearPendingPreferences(): Promise<void> {
    this.pendingPreferencesFallback = null
    await this.metadata?.clearPendingPreferences()
  }

  private syncHeaders(json = false): HeadersInit {
    return {
      ...(json ? { 'content-type': 'application/json' } : {}),
      'x-kibotalk-user-id': this.userId,
    }
  }
}

export type CloudConversationStorageState = {
  storage: CloudConversationStorage | null
  syncing: boolean
  error: string
  retry: () => void
}

/**
 * Shared account-to-cloud-storage lifecycle for web and both desktop windows.
 * Local storage is available immediately; initial cloud reconciliation runs
 * in the background and retries without gating a new session.
 */
export function useCloudConversationStorage(args: {
  local: ConversationStorage
  userId: string | null
  onPreferences?: (preferences: unknown) => void
}): CloudConversationStorageState {
  const { local, userId } = args
  const preferencesHandler = useRef(args.onPreferences)
  preferencesHandler.current = args.onPreferences
  const [storage, setStorage] = useState<CloudConversationStorage | null>(null)
  const [syncing, setSyncing] = useState(Boolean(userId))
  const [error, setError] = useState('')
  const initializeRef = useRef<() => void>(() => undefined)
  const retry = useCallback(() => initializeRef.current(), [])

  useEffect(() => {
    if (!userId) {
      initializeRef.current = () => undefined
      setStorage(null)
      setSyncing(false)
      setError('')
      return
    }
    let cancelled = false
    const next = new CloudConversationStorage(local, userId, setError)
    setStorage(next)
    setSyncing(true)
    setError('')
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelayMs = 2_000
    let initializing = false
    const initialize = async () => {
      if (initializing) return
      initializing = true
      setSyncing(true)
      try {
        const preferences = await next.initialize()
        if (cancelled) return
        if (preferences !== null) preferencesHandler.current?.(preferences)
        setError('')
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : String(cause))
        retryTimer = setTimeout(() => {
          retryTimer = null
          retryDelayMs = Math.min(30_000, retryDelayMs * 2)
          void initialize()
        }, retryDelayMs)
      } finally {
        initializing = false
        if (!cancelled) setSyncing(false)
      }
    }
    initializeRef.current = () => {
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      void initialize()
    }
    void initialize()
    return () => {
      cancelled = true
      initializeRef.current = () => undefined
      if (retryTimer) clearTimeout(retryTimer)
      next.dispose()
    }
  }, [local, userId])

  return { storage, syncing, error, retry }
}

export async function syncPreferences(
  preferences: unknown,
  cloudStorage: CloudConversationStorage | null,
): Promise<void> {
  if (!cloudStorage) return
  await cloudStorage.updatePreferences(preferences)
}

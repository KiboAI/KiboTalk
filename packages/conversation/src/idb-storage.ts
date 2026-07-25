import type {
  ConversationStorage,
  ConversationSyncMetadataStorage,
} from './storage'
import type {
  ConversationPauseReason,
  ConversationReviewUpdate,
  ConversationSession,
  ConversationSessionStart,
  ConversationTurn,
  ReplyCandidate,
} from './types'

const DB_NAME = 'kibotalk-conversation'
const SESSIONS_STORE = 'sessions'
const META_STORE = 'meta'
const ACTIVE_SESSION_KEY = 'active-session-id'
const DIRTY_SESSION_PREFIX = 'sync-dirty-session:'
const PENDING_PREFERENCES_KEY = 'sync-pending-preferences'
const DB_VERSION = 2

type MetaRecord = { key: string; value: string }

export function accountConversationDatabaseName(userId: string): string {
  return `${DB_NAME}:account:${encodeURIComponent(userId)}`
}

/**
 * IndexedDB-backed conversation storage. Sessions survive refresh and remain
 * in local history until explicitly cleared; raw audio is never written.
 */
export class IndexedDbConversationStorage
  implements ConversationStorage, ConversationSyncMetadataStorage {
  private dbName: string
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(dbName = DB_NAME) {
    this.dbName = dbName
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const name of [...db.objectStoreNames]) db.deleteObjectStore(name)
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.dbPromise
  }

  private async transaction(
    stores: string[],
    mode: IDBTransactionMode,
  ): Promise<IDBTransaction> {
    const db = await this.openDb()
    return db.transaction(stores, mode)
  }

  async startSession(start: ConversationSessionStart): Promise<ConversationSession> {
    const session: ConversationSession = {
      ...start,
      status: 'running',
      pausedDurationMs: 0,
      turns: [],
      reviewStatus: 'pending',
    }
    const tx = await this.transaction([SESSIONS_STORE, META_STORE], 'readwrite')
    tx.objectStore(SESSIONS_STORE).put(session)
    tx.objectStore(META_STORE).put({ key: ACTIVE_SESSION_KEY, value: session.id } satisfies MetaRecord)
    await transactionDone(tx)
    return structuredClone(session)
  }

  async appendTurn(turn: ConversationTurn): Promise<void> {
    const tx = await this.transaction([SESSIONS_STORE, META_STORE], 'readwrite')
    const session = await activeSessionFromTransaction(tx)
    if (!session) {
      tx.abort()
      throw new Error('No active conversation session')
    }
    session.turns.push(turn)
    tx.objectStore(SESSIONS_STORE).put(session)
    await transactionDone(tx)
  }

  async updateTurnSuggestions(turnId: string, suggestions: ReplyCandidate[]): Promise<void> {
    const tx = await this.transaction([SESSIONS_STORE, META_STORE], 'readwrite')
    const session = await activeSessionFromTransaction(tx)
    if (!session) {
      tx.abort()
      return
    }
    session.turns = session.turns.map((turn) =>
      turn.id === turnId ? { ...turn, suggestions: [...suggestions] } : turn,
    )
    tx.objectStore(SESSIONS_STORE).put(session)
    await transactionDone(tx)
  }

  async loadActiveSession(): Promise<ConversationTurn[] | null> {
    const session = await this.getActiveSession()
    return session && session.turns.length > 0 ? session.turns : null
  }

  async getActiveSession(): Promise<ConversationSession | null> {
    const tx = await this.transaction([SESSIONS_STORE, META_STORE], 'readonly')
    return activeSessionFromTransaction(tx)
  }

  async pauseActiveSession(
    reason: ConversationPauseReason,
    pausedAt = Date.now(),
  ): Promise<ConversationSession | null> {
    return this.updateActiveSession((session) => ({
      ...session,
      status: 'paused',
      pausedAt,
      pauseReason: reason,
    }))
  }

  async resumeActiveSession(resumedAt = Date.now()): Promise<ConversationSession | null> {
    return this.updateActiveSession((session) => {
      if (session.status !== 'paused') return session
      const pausedDurationMs =
        session.pausedDurationMs + Math.max(0, resumedAt - (session.pausedAt ?? resumedAt))
      const next = { ...session, status: 'running' as const, pausedDurationMs }
      delete next.pausedAt
      delete next.pauseReason
      return next
    })
  }

  async stopActiveSession(endedAt = Date.now()): Promise<ConversationSession | null> {
    const tx = await this.transaction([SESSIONS_STORE, META_STORE], 'readwrite')
    const session = await activeSessionFromTransaction(tx)
    if (!session) {
      tx.abort()
      return null
    }
    const pausedDurationMs =
      session.status === 'paused'
        ? session.pausedDurationMs + Math.max(0, endedAt - (session.pausedAt ?? endedAt))
        : session.pausedDurationMs
    const stopped: ConversationSession = {
      ...session,
      status: 'stopped',
      endedAt,
      pausedDurationMs,
    }
    delete stopped.pausedAt
    delete stopped.pauseReason
    tx.objectStore(SESSIONS_STORE).put(stopped)
    tx.objectStore(META_STORE).delete(ACTIVE_SESSION_KEY)
    await transactionDone(tx)
    return structuredClone(stopped)
  }

  async clearActiveSession(): Promise<void> {
    const tx = await this.transaction([SESSIONS_STORE, META_STORE], 'readwrite')
    const activeId = await activeSessionIdFromTransaction(tx)
    if (activeId) tx.objectStore(SESSIONS_STORE).delete(activeId)
    tx.objectStore(META_STORE).delete(ACTIVE_SESSION_KEY)
    await transactionDone(tx)
  }

  async listSessions(): Promise<ConversationSession[]> {
    const tx = await this.transaction([SESSIONS_STORE], 'readonly')
    const sessions = await requestToPromise<ConversationSession[]>(
      tx.objectStore(SESSIONS_STORE).getAll(),
    )
    return sessions.sort((a, b) => b.startedAt - a.startedAt)
  }

  async loadSession(sessionId: string): Promise<ConversationSession | null> {
    const tx = await this.transaction([SESSIONS_STORE], 'readonly')
    const session = await requestToPromise<ConversationSession | undefined>(
      tx.objectStore(SESSIONS_STORE).get(sessionId),
    )
    return session ?? null
  }

  async upsertSession(session: ConversationSession): Promise<void> {
    const tx = await this.transaction([SESSIONS_STORE], 'readwrite')
    tx.objectStore(SESSIONS_STORE).put(structuredClone(session))
    await transactionDone(tx)
  }

  async deleteSession(sessionId: string): Promise<void> {
    const tx = await this.transaction([SESSIONS_STORE, META_STORE], 'readwrite')
    const activeId = await activeSessionIdFromTransaction(tx)
    if (activeId === sessionId) tx.objectStore(META_STORE).delete(ACTIVE_SESSION_KEY)
    tx.objectStore(SESSIONS_STORE).delete(sessionId)
    await transactionDone(tx)
  }

  async updateSessionReview(sessionId: string, update: ConversationReviewUpdate): Promise<void> {
    const tx = await this.transaction([SESSIONS_STORE], 'readwrite')
    const store = tx.objectStore(SESSIONS_STORE)
    const session = await requestToPromise<ConversationSession | undefined>(store.get(sessionId))
    if (session) store.put({ ...session, ...update })
    await transactionDone(tx)
  }

  async clearHistory(): Promise<void> {
    const tx = await this.transaction([SESSIONS_STORE, META_STORE], 'readwrite')
    const active = await activeSessionFromTransaction(tx)
    tx.objectStore(SESSIONS_STORE).clear()
    if (active) tx.objectStore(SESSIONS_STORE).put(active)
    await transactionDone(tx)
  }

  async markSessionDirty(sessionId: string): Promise<void> {
    const tx = await this.transaction([META_STORE], 'readwrite')
    tx.objectStore(META_STORE).put({
      key: `${DIRTY_SESSION_PREFIX}${sessionId}`,
      value: sessionId,
    } satisfies MetaRecord)
    await transactionDone(tx)
  }

  async clearSessionDirty(sessionId: string): Promise<void> {
    const tx = await this.transaction([META_STORE], 'readwrite')
    tx.objectStore(META_STORE).delete(`${DIRTY_SESSION_PREFIX}${sessionId}`)
    await transactionDone(tx)
  }

  async listDirtySessionIds(): Promise<string[]> {
    const tx = await this.transaction([META_STORE], 'readonly')
    const records = await requestToPromise<MetaRecord[]>(tx.objectStore(META_STORE).getAll())
    return records
      .filter((record) => record.key.startsWith(DIRTY_SESSION_PREFIX))
      .map((record) => record.value)
  }

  async setPendingPreferences(preferences: unknown): Promise<void> {
    const tx = await this.transaction([META_STORE], 'readwrite')
    tx.objectStore(META_STORE).put({
      key: PENDING_PREFERENCES_KEY,
      value: JSON.stringify(preferences),
    } satisfies MetaRecord)
    await transactionDone(tx)
  }

  async loadPendingPreferences(): Promise<unknown | null> {
    const tx = await this.transaction([META_STORE], 'readonly')
    const record = await requestToPromise<MetaRecord | undefined>(
      tx.objectStore(META_STORE).get(PENDING_PREFERENCES_KEY),
    )
    if (!record) return null
    try {
      return JSON.parse(record.value) as unknown
    } catch {
      return null
    }
  }

  async clearPendingPreferences(): Promise<void> {
    const tx = await this.transaction([META_STORE], 'readwrite')
    tx.objectStore(META_STORE).delete(PENDING_PREFERENCES_KEY)
    await transactionDone(tx)
  }

  private async updateActiveSession(
    update: (session: ConversationSession) => ConversationSession,
  ): Promise<ConversationSession | null> {
    const tx = await this.transaction([SESSIONS_STORE, META_STORE], 'readwrite')
    const session = await activeSessionFromTransaction(tx)
    if (!session || session.status === 'stopped') {
      tx.abort()
      return null
    }
    const next = update(session)
    tx.objectStore(SESSIONS_STORE).put(next)
    await transactionDone(tx)
    return structuredClone(next)
  }
}

async function activeSessionIdFromTransaction(tx: IDBTransaction): Promise<string | null> {
  const meta = await requestToPromise<MetaRecord | undefined>(
    tx.objectStore(META_STORE).get(ACTIVE_SESSION_KEY),
  )
  return meta?.value ?? null
}

async function activeSessionFromTransaction(tx: IDBTransaction): Promise<ConversationSession | null> {
  const activeId = await activeSessionIdFromTransaction(tx)
  if (!activeId) return null
  const session = await requestToPromise<ConversationSession | undefined>(
    tx.objectStore(SESSIONS_STORE).get(activeId),
  )
  return session ?? null
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  InMemoryConversationStorage,
  type ConversationSession,
  type ConversationSyncMetadataStorage,
} from '@kibotalk/conversation'
import {
  CloudConversationStorage,
  syncPreferences,
} from '../src/cloud-conversation-storage'

class SyncAwareMemoryStorage
  extends InMemoryConversationStorage
  implements ConversationSyncMetadataStorage {
  readonly dirtySessionIds = new Set<string>()
  pendingPreferences: unknown | null = null

  async markSessionDirty(sessionId: string): Promise<void> {
    this.dirtySessionIds.add(sessionId)
  }

  async clearSessionDirty(sessionId: string): Promise<void> {
    this.dirtySessionIds.delete(sessionId)
  }

  async listDirtySessionIds(): Promise<string[]> {
    return [...this.dirtySessionIds]
  }

  async setPendingPreferences(preferences: unknown): Promise<void> {
    this.pendingPreferences = structuredClone(preferences)
  }

  async loadPendingPreferences(): Promise<unknown | null> {
    return structuredClone(this.pendingPreferences)
  }

  async clearPendingPreferences(): Promise<void> {
    this.pendingPreferences = null
  }
}

function session(title: string): ConversationSession {
  return {
    id: 'session-1',
    status: 'stopped',
    startedAt: 1,
    endedAt: 2,
    pausedDurationMs: 0,
    snapshot: {
      conversationLang: 'ja',
      meaningLang: 'zh',
      uiLang: 'zh',
      level: 'beginner',
      audioSource: 'microphone',
      microphoneDeviceId: 'default',
    },
    turns: [],
    title,
    reviewStatus: 'ready',
  }
}

function syncResponse(remoteSession?: ConversationSession, preferences: unknown = null): Response {
  return Response.json({
    cursor: 1,
    sessions: remoteSession ? [{ session: remoteSession, version: 1 }] : [],
    deletedSessionIds: [],
    preferences: preferences === null ? null : { value: preferences, version: 1 },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CloudConversationStorage recovery', () => {
  it('does not stage device preferences before the initial cloud pull completes', async () => {
    const local = new SyncAwareMemoryStorage()

    await syncPreferences({ conversationLang: 'ja' }, null)

    expect(local.pendingPreferences).toBeNull()
  })

  it('pushes a dirty local session instead of overwriting it with stale cloud data', async () => {
    const local = new SyncAwareMemoryStorage()
    await local.upsertSession(session('new local title'))
    await local.markSessionDirty('session-1')
    const requests: Array<{ method: string; body?: string }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const method = init?.method ?? 'GET'
      requests.push({ method, body: init?.body?.toString() })
      return method === 'GET' ? syncResponse(session('stale remote title')) : Response.json({ ok: true })
    })

    const cloud = new CloudConversationStorage(local, 'user-1')
    await cloud.initialize()
    await cloud.flush()

    expect((await local.loadSession('session-1'))?.title).toBe('new local title')
    expect(requests.find(({ method }) => method === 'PUT')?.body).toContain('new local title')
    expect(local.dirtySessionIds.size).toBe(0)
    cloud.dispose()
  })

  it('accepts the cloud version when the local session is clean', async () => {
    const local = new SyncAwareMemoryStorage()
    await local.upsertSession(session('clean local title'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(syncResponse(session('new remote title')))

    const cloud = new CloudConversationStorage(local, 'user-1')
    await cloud.initialize()

    expect((await local.loadSession('session-1'))?.title).toBe('new remote title')
    cloud.dispose()
  })

  it('keeps failed uploads dirty for a later automatic retry', async () => {
    const local = new SyncAwareMemoryStorage()
    await local.upsertSession(session('local only'))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
      (init?.method ?? 'GET') === 'GET'
        ? syncResponse()
        : Response.json({ error: 'offline' }, { status: 503 }),
    )

    const cloud = new CloudConversationStorage(local, 'user-1')
    await cloud.initialize()
    await cloud.flush()

    expect(local.dirtySessionIds.has('session-1')).toBe(true)
    cloud.dispose()
  })

  it('restores pending local preferences and uploads them before using remote preferences', async () => {
    const local = new SyncAwareMemoryStorage()
    await local.setPendingPreferences({ conversationLang: 'ja' })
    const uploaded: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const method = init?.method ?? 'GET'
      if (method === 'PUT') uploaded.push(String(init?.body))
      return method === 'GET'
        ? syncResponse(undefined, { conversationLang: 'en' })
        : Response.json({ ok: true })
    })

    const cloud = new CloudConversationStorage(local, 'user-1')
    const preferences = await cloud.initialize()
    await cloud.flush()

    expect(preferences).toEqual({ conversationLang: 'ja' })
    expect(uploaded[0]).toContain('"conversationLang":"ja"')
    expect(local.pendingPreferences).toBeNull()
    cloud.dispose()
  })
})

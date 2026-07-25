import type { Context } from 'hono'
import type { ConversationSession } from '@kibotalk/conversation'
import { requireRequestAuth } from './auth'
import { decryptJson, encryptJson } from './crypto'
import { getDatabase } from './db'

async function requireSyncAuth(context: Context) {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  if (context.req.header('x-kibotalk-user-id') !== auth.userId) {
    return context.json({ error: 'SYNC_ACCOUNT_CHANGED' }, 409)
  }
  return auth
}

function validSession(value: unknown, expectedId: string): value is ConversationSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<ConversationSession>
  return (
    session.id === expectedId
    && (session.status === 'running' || session.status === 'paused' || session.status === 'stopped')
    && typeof session.startedAt === 'number'
    && Array.isArray(session.turns)
    && typeof session.title === 'string'
    && Boolean(session.snapshot)
  )
}

export async function listSyncChanges(context: Context): Promise<Response> {
  const auth = await requireSyncAuth(context)
  if (auth instanceof Response) return auth
  const since = Math.max(0, Number(context.req.query('since') ?? 0) || 0)
  const sql = getDatabase()
  const rows = await sql<{
    session_id: string
    ciphertext: Buffer | null
    iv: Buffer | null
    auth_tag: Buffer | null
    version: string | number
    deleted_at: Date | null
  }[]>`
    SELECT session_id, ciphertext, iv, auth_tag, version, deleted_at
    FROM synced_sessions
    WHERE user_id = ${auth.userId}
      AND version > ${since}
    ORDER BY version ASC
    LIMIT 1000
  `
  const sessions: Array<{ session: ConversationSession; version: number }> = []
  const deletedSessionIds: Array<{ id: string; version: number }> = []
  let cursor = since
  for (const row of rows) {
    const version = Number(row.version)
    cursor = Math.max(cursor, version)
    if (row.deleted_at || !row.ciphertext || !row.iv || !row.auth_tag) {
      deletedSessionIds.push({ id: row.session_id, version })
      continue
    }
    try {
      sessions.push({
        session: decryptJson<ConversationSession>(auth.userId, row.session_id, {
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.auth_tag,
        }),
        version,
      })
    } catch {
      return context.json({ error: 'SYNC_DECRYPTION_FAILED', sessionId: row.session_id }, 500)
    }
  }
  const [preferences] = await sql<{
    ciphertext: Buffer
    iv: Buffer
    auth_tag: Buffer
    version: string | number
  }[]>`
    SELECT ciphertext, iv, auth_tag, version
    FROM synced_preferences
    WHERE user_id = ${auth.userId}
      AND version > ${since}
  `
  let prefs: { value: unknown; version: number } | null = null
  if (preferences) {
    const version = Number(preferences.version)
    cursor = Math.max(cursor, version)
    prefs = {
      value: decryptJson(auth.userId, 'preferences', {
        ciphertext: preferences.ciphertext,
        iv: preferences.iv,
        authTag: preferences.auth_tag,
      }),
      version,
    }
  }
  return context.json({ cursor, sessions, deletedSessionIds, preferences: prefs })
}

export async function putSyncedSession(context: Context): Promise<Response> {
  const auth = await requireSyncAuth(context)
  if (auth instanceof Response) return auth
  const sessionId = context.req.param('sessionId')
  if (!sessionId) return context.json({ error: 'INVALID_SESSION' }, 400)
  const body = (await context.req.json().catch(() => null)) as { session?: unknown } | null
  if (!validSession(body?.session, sessionId)) {
    return context.json({ error: 'INVALID_SESSION' }, 400)
  }
  const session = body.session
  const encrypted = encryptJson(auth.userId, sessionId, session)
  const sql = getDatabase()
  const [row] = await sql<{ version: string | number }[]>`
    INSERT INTO synced_sessions (
      user_id, session_id, status, started_at, ended_at,
      ciphertext, iv, auth_tag, version, updated_at, deleted_at
    )
    VALUES (
      ${auth.userId},
      ${sessionId},
      ${session.status},
      ${new Date(session.startedAt)},
      ${session.endedAt ? new Date(session.endedAt) : null},
      ${encrypted.ciphertext},
      ${encrypted.iv},
      ${encrypted.authTag},
      nextval('sync_version_sequence'),
      now(),
      NULL
    )
    ON CONFLICT (user_id, session_id) DO UPDATE SET
      status = EXCLUDED.status,
      started_at = EXCLUDED.started_at,
      ended_at = EXCLUDED.ended_at,
      ciphertext = EXCLUDED.ciphertext,
      iv = EXCLUDED.iv,
      auth_tag = EXCLUDED.auth_tag,
      version = nextval('sync_version_sequence'),
      updated_at = now(),
      deleted_at = NULL
    RETURNING version
  `
  return context.json({ ok: true, version: Number(row!.version) })
}

export async function deleteSyncedSession(context: Context): Promise<Response> {
  const auth = await requireSyncAuth(context)
  if (auth instanceof Response) return auth
  const sessionId = context.req.param('sessionId')
  if (!sessionId) return context.json({ error: 'INVALID_SESSION' }, 400)
  const sql = getDatabase()
  const [row] = await sql<{ version: string | number }[]>`
    INSERT INTO synced_sessions (
      user_id, session_id, status, started_at, version, updated_at, deleted_at
    )
    VALUES (
      ${auth.userId}, ${sessionId}, 'stopped', now(),
      nextval('sync_version_sequence'), now(), now()
    )
    ON CONFLICT (user_id, session_id) DO UPDATE SET
      ciphertext = NULL,
      iv = NULL,
      auth_tag = NULL,
      version = nextval('sync_version_sequence'),
      updated_at = now(),
      deleted_at = now()
    RETURNING version
  `
  return context.json({ ok: true, version: Number(row!.version) })
}

export async function clearSyncedHistory(context: Context): Promise<Response> {
  const auth = await requireSyncAuth(context)
  if (auth instanceof Response) return auth
  const sql = getDatabase()
  await sql`
    UPDATE synced_sessions
    SET
      ciphertext = NULL,
      iv = NULL,
      auth_tag = NULL,
      version = nextval('sync_version_sequence'),
      updated_at = now(),
      deleted_at = now()
    WHERE user_id = ${auth.userId}
      AND deleted_at IS NULL
      AND status = 'stopped'
  `
  return context.json({ ok: true })
}

export async function putSyncedPreferences(context: Context): Promise<Response> {
  const auth = await requireSyncAuth(context)
  if (auth instanceof Response) return auth
  const body = (await context.req.json().catch(() => null)) as { preferences?: unknown } | null
  if (!body || !body.preferences || typeof body.preferences !== 'object') {
    return context.json({ error: 'INVALID_PREFERENCES' }, 400)
  }
  const encrypted = encryptJson(auth.userId, 'preferences', body.preferences)
  const sql = getDatabase()
  const [row] = await sql<{ version: string | number }[]>`
    INSERT INTO synced_preferences (
      user_id, ciphertext, iv, auth_tag, version, updated_at
    )
    VALUES (
      ${auth.userId}, ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.authTag},
      nextval('sync_version_sequence'), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      ciphertext = EXCLUDED.ciphertext,
      iv = EXCLUDED.iv,
      auth_tag = EXCLUDED.auth_tag,
      version = nextval('sync_version_sequence'),
      updated_at = now()
    RETURNING version
  `
  return context.json({ ok: true, version: Number(row!.version) })
}

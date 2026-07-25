import { getDatabase } from './db'

export async function claimActiveAiSession(args: {
  userId: string
  deviceSessionId: string
  conversationSessionId: string
}): Promise<boolean> {
  const sql = getDatabase()
  const rows = await sql<{ user_id: string }[]>`
    INSERT INTO active_ai_sessions (
      user_id, device_session_id, conversation_session_id, expires_at
    )
    VALUES (
      ${args.userId},
      ${args.deviceSessionId},
      ${args.conversationSessionId},
      now() + interval '90 seconds'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      device_session_id = EXCLUDED.device_session_id,
      conversation_session_id = EXCLUDED.conversation_session_id,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
    WHERE active_ai_sessions.expires_at <= now()
      OR (
        active_ai_sessions.device_session_id = EXCLUDED.device_session_id
        AND active_ai_sessions.conversation_session_id = EXCLUDED.conversation_session_id
      )
    RETURNING user_id
  `
  return rows.length > 0
}

export async function refreshActiveAiSession(args: {
  userId: string
  deviceSessionId: string
  conversationSessionId: string
}): Promise<void> {
  const sql = getDatabase()
  const expiresAt = new Date(Date.now() + 90 * 1000)
  await sql`
    UPDATE active_ai_sessions
    SET expires_at = ${expiresAt},
        updated_at = now()
    WHERE user_id = ${args.userId}
      AND device_session_id = ${args.deviceSessionId}
      AND conversation_session_id = ${args.conversationSessionId}
  `
}

export async function releaseActiveAiSession(args: {
  userId: string
  deviceSessionId: string
  conversationSessionId: string
}): Promise<void> {
  const sql = getDatabase()
  await sql`
    DELETE FROM active_ai_sessions
    WHERE user_id = ${args.userId}
      AND device_session_id = ${args.deviceSessionId}
      AND conversation_session_id = ${args.conversationSessionId}
  `
}

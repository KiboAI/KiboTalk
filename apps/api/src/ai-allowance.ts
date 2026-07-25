import { databaseConfigured, getDatabase } from './db'
import { quotaSummary } from './quota'

export type AiUseKind = 'reply' | 'review'

export type AiUseAuthorization = {
  allowed: boolean
  allowanceConsumed: boolean
}

export async function grantFinalAiAllowance(
  userId: string,
  conversationSessionId: string,
): Promise<void> {
  const sql = getDatabase()
  await sql`
    INSERT INTO final_ai_allowances (
      user_id,
      conversation_session_id,
      reply_remaining,
      review_remaining,
      expires_at
    )
    VALUES (
      ${userId},
      ${conversationSessionId},
      1,
      1,
      now() + interval '24 hours'
    )
    ON CONFLICT (user_id, conversation_session_id) DO UPDATE SET
      reply_remaining = 1,
      review_remaining = 1,
      expires_at = EXCLUDED.expires_at
    WHERE final_ai_allowances.expires_at <= now()
  `
}

export async function authorizeAiUse(args: {
  userId: string
  conversationSessionId?: string
  kind: AiUseKind
}): Promise<AiUseAuthorization> {
  if (!databaseConfigured() || process.env.APP_ENV !== 'production') {
    return { allowed: true, allowanceConsumed: false }
  }
  if ((await quotaSummary(args.userId)).totalSeconds > 0) {
    return { allowed: true, allowanceConsumed: false }
  }
  if (!args.conversationSessionId) {
    return { allowed: false, allowanceConsumed: false }
  }
  const sql = getDatabase()
  const rows = args.kind === 'reply'
    ? await sql`
        UPDATE final_ai_allowances
        SET reply_remaining = reply_remaining - 1
        WHERE user_id = ${args.userId}
          AND conversation_session_id = ${args.conversationSessionId}
          AND expires_at > now()
          AND reply_remaining > 0
        RETURNING user_id
      `
    : await sql`
        UPDATE final_ai_allowances
        SET review_remaining = review_remaining - 1
        WHERE user_id = ${args.userId}
          AND conversation_session_id = ${args.conversationSessionId}
          AND expires_at > now()
          AND review_remaining > 0
        RETURNING user_id
      `
  return { allowed: rows.length > 0, allowanceConsumed: rows.length > 0 }
}

export async function refundAiAllowance(args: {
  userId: string
  conversationSessionId?: string
  kind: AiUseKind
}): Promise<void> {
  if (!args.conversationSessionId || !databaseConfigured()) return
  const sql = getDatabase()
  if (args.kind === 'reply') {
    await sql`
      UPDATE final_ai_allowances
      SET reply_remaining = LEAST(1, reply_remaining + 1)
      WHERE user_id = ${args.userId}
        AND conversation_session_id = ${args.conversationSessionId}
        AND expires_at > now()
    `
    return
  }
  await sql`
    UPDATE final_ai_allowances
    SET review_remaining = LEAST(1, review_remaining + 1)
    WHERE user_id = ${args.userId}
      AND conversation_session_id = ${args.conversationSessionId}
      AND expires_at > now()
  `
}

import { getDatabase } from './db'

export const FREE_MONTHLY_SECONDS = 10 * 60
export const PRO_PLAN_SECONDS = 600 * 60
export const PRO_PLAN_DAYS = 30
export const MAX_TURN_OVERDRAW_SECONDS = 30

export type QuotaSummary = {
  freeSeconds: number
  proSeconds: number
  paidSeconds: number
  totalSeconds: number
  proUntil: string | null
  resetsAt: string
}

function beijingMonth(now = new Date()): {
  source: string
  startsAt: Date
  expiresAt: Date
} {
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const year = beijing.getUTCFullYear()
  const month = beijing.getUTCMonth()
  const startsAt = new Date(Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000)
  const expiresAt = new Date(Date.UTC(year, month + 1, 1) - 8 * 60 * 60 * 1000)
  return {
    source: `free:${year}-${String(month + 1).padStart(2, '0')}`,
    startsAt,
    expiresAt,
  }
}

export async function ensureMonthlyFreeBucket(userId: string): Promise<void> {
  const sql = getDatabase()
  const period = beijingMonth()
  await sql`
    INSERT INTO credit_buckets (
      user_id, kind, source, granted_seconds, remaining_seconds, starts_at, expires_at
    )
    VALUES (
      ${userId}, 'free', ${period.source}, ${FREE_MONTHLY_SECONDS},
      ${FREE_MONTHLY_SECONDS}, ${period.startsAt}, ${period.expiresAt}
    )
    ON CONFLICT (user_id, source) DO NOTHING
  `
}

export async function quotaSummary(userId: string): Promise<QuotaSummary> {
  await ensureMonthlyFreeBucket(userId)
  const sql = getDatabase()
  const [row] = await sql<{
    free_seconds: number
    pro_seconds: number
    paid_seconds: number
    pro_until: Date | null
  }[]>`
    SELECT
      COALESCE(sum(remaining_seconds) FILTER (
        WHERE kind = 'free' AND starts_at <= now() AND expires_at > now()
      ), 0)::integer AS free_seconds,
      COALESCE(sum(remaining_seconds) FILTER (
        WHERE kind = 'pro' AND starts_at <= now() AND expires_at > now()
      ), 0)::integer AS pro_seconds,
      COALESCE(sum(remaining_seconds) FILTER (
        WHERE kind = 'paid' AND starts_at <= now() AND (expires_at IS NULL OR expires_at > now())
      ), 0)::integer AS paid_seconds,
      max(expires_at) FILTER (WHERE kind = 'pro' AND expires_at > now()) AS pro_until
    FROM credit_buckets
    WHERE user_id = ${userId}
  `
  const period = beijingMonth()
  const freeSeconds = Number(row?.free_seconds ?? 0)
  const proSeconds = Number(row?.pro_seconds ?? 0)
  const paidSeconds = Number(row?.paid_seconds ?? 0)
  return {
    freeSeconds,
    proSeconds,
    paidSeconds,
    totalSeconds: freeSeconds + proSeconds + paidSeconds,
    proUntil: row?.pro_until?.toISOString() ?? null,
    resetsAt: period.expiresAt.toISOString(),
  }
}

export type DeductionResult = {
  billedSeconds: number
  deductedSeconds: number
  overdrawSeconds: number
  exhausted: boolean
}

/**
 * Deduct one completed turn atomically, oldest expiring credit first in the
 * business order free → Pro → permanent paid. The request id makes a retried
 * upstream completion idempotent.
 */
export async function deductCompletedTurn(args: {
  userId: string
  audioSeconds: number
  requestId: string
  conversationSessionId?: string
}): Promise<DeductionResult> {
  const billedSeconds = Math.max(1, Math.ceil(args.audioSeconds))
  await ensureMonthlyFreeBucket(args.userId)
  const sql = getDatabase()
  return sql.begin(async (transaction) => {
    await transaction`SELECT id FROM users WHERE id = ${args.userId} FOR UPDATE`
    const existing = await transaction<{ entry_count: number; deducted_seconds: number }[]>`
      SELECT
        count(*)::integer AS entry_count,
        COALESCE(-sum(delta_seconds), 0)::integer AS deducted_seconds
      FROM quota_ledger
      WHERE user_id = ${args.userId} AND request_id = ${args.requestId}
    `
    if (Number(existing[0]?.entry_count ?? 0) > 0) {
      const deductedSeconds = Number(existing[0]?.deducted_seconds ?? 0)
      const [remaining] = await transaction<{ total_seconds: number }[]>`
        SELECT COALESCE(sum(remaining_seconds), 0)::integer AS total_seconds
        FROM credit_buckets
        WHERE user_id = ${args.userId}
          AND remaining_seconds > 0
          AND starts_at <= now()
          AND (expires_at IS NULL OR expires_at > now())
      `
      return {
        billedSeconds,
        deductedSeconds,
        overdrawSeconds: Math.max(0, billedSeconds - deductedSeconds),
        exhausted: Number(remaining?.total_seconds ?? 0) <= 0,
      }
    }

    const buckets = await transaction<{
      id: string
      remaining_seconds: number
    }[]>`
      SELECT id, remaining_seconds
      FROM credit_buckets
      WHERE user_id = ${args.userId}
        AND remaining_seconds > 0
        AND starts_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY
        CASE kind WHEN 'free' THEN 0 WHEN 'pro' THEN 1 ELSE 2 END,
        expires_at ASC NULLS LAST,
        created_at ASC
      FOR UPDATE
    `

    let remaining = billedSeconds
    let deductedSeconds = 0
    for (const bucket of buckets) {
      if (remaining <= 0) break
      const amount = Math.min(remaining, Number(bucket.remaining_seconds))
      await transaction`
        UPDATE credit_buckets
        SET remaining_seconds = remaining_seconds - ${amount}
        WHERE id = ${bucket.id}
      `
      await transaction`
        INSERT INTO quota_ledger (
          user_id, bucket_id, delta_seconds, event_type, request_id,
          conversation_session_id, metadata
        )
        VALUES (
          ${args.userId}, ${bucket.id}, ${-amount}, 'stt_completed',
          ${args.requestId}, ${args.conversationSessionId ?? null},
          ${transaction.json({ billedSeconds })}
        )
      `
      remaining -= amount
      deductedSeconds += amount
    }

    if (remaining > 0) {
      await transaction`
        INSERT INTO quota_ledger (
          user_id, delta_seconds, event_type, request_id,
          conversation_session_id, metadata
        )
        VALUES (
          ${args.userId}, 0, 'controlled_overdraw', ${args.requestId},
          ${args.conversationSessionId ?? null},
          ${transaction.json({ billedSeconds, overdrawSeconds: remaining })}
        )
      `
    }

    const [remainingQuota] = await transaction<{ total_seconds: number }[]>`
      SELECT COALESCE(sum(remaining_seconds), 0)::integer AS total_seconds
      FROM credit_buckets
      WHERE user_id = ${args.userId}
        AND remaining_seconds > 0
        AND starts_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
    `
    return {
      billedSeconds,
      deductedSeconds,
      overdrawSeconds: remaining,
      exhausted: Number(remainingQuota?.total_seconds ?? 0) <= 0,
    }
  })
}

export async function grantCredit(args: {
  userId: string
  kind: 'pro' | 'paid'
  seconds: number
  source: string
  durationDays?: number
  actorUserId?: string
}): Promise<string> {
  const sql = getDatabase()
  const expiresAt = args.kind === 'pro'
    ? new Date(Date.now() + (args.durationDays ?? PRO_PLAN_DAYS) * 24 * 60 * 60 * 1000)
    : null
  const [bucket] = await sql<{ id: string }[]>`
    INSERT INTO credit_buckets (
      user_id, kind, source, granted_seconds, remaining_seconds, expires_at
    )
    VALUES (
      ${args.userId}, ${args.kind}, ${args.source}, ${args.seconds},
      ${args.seconds}, ${expiresAt}
    )
    RETURNING id
  `
  if (!bucket) throw new Error('Failed to create credit bucket')
  await sql`
    INSERT INTO quota_ledger (
      user_id, bucket_id, delta_seconds, event_type, metadata
    )
    VALUES (
      ${args.userId}, ${bucket.id}, ${args.seconds}, 'grant',
      ${sql.json({ source: args.source, actorUserId: args.actorUserId })}
    )
  `
  return bucket.id
}

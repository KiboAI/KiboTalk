import { randomBytes } from 'node:crypto'
import type { Context } from 'hono'
import { normalizeAccessCode } from './access-code'
import { requireRequestAuth } from './auth'
import { getDatabase } from './db'
import { grantCredit, quotaSummary } from './quota'

export async function redeemVoucher(context: Context): Promise<Response> {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  const body = (await context.req.json().catch(() => null)) as { code?: unknown } | null
  const code = normalizeAccessCode(body?.code)
  if (!code) return context.json({ error: 'INVALID_VOUCHER_CODE' }, 400)
  const sql = getDatabase()

  const outcome = await sql.begin(async (transaction) => {
    const [voucher] = await transaction<{
      id: string
      benefit_kind: 'pro' | 'paid'
      grant_seconds: number
      duration_days: number | null
      max_redemptions: number
      per_user_limit: number
      redemption_count: number
      active: boolean
    }[]>`
      SELECT
        id,
        benefit_kind,
        grant_seconds,
        duration_days,
        max_redemptions,
        per_user_limit,
        redemption_count,
        active
      FROM vouchers
      WHERE code = ${code}
        AND valid_from <= now()
        AND (valid_until IS NULL OR valid_until > now())
      FOR UPDATE
    `
    if (!voucher || !voucher.active) return { error: 'VOUCHER_UNAVAILABLE' } as const
    if (voucher.redemption_count >= voucher.max_redemptions) {
      return { error: 'VOUCHER_EXHAUSTED' } as const
    }
    const [count] = await transaction<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM voucher_redemptions
      WHERE voucher_id = ${voucher.id} AND user_id = ${auth.userId}
    `
    if (Number(count?.count ?? 0) >= voucher.per_user_limit) {
      return { error: 'VOUCHER_USER_LIMIT' } as const
    }
    const source = `voucher:${voucher.id}:${auth.userId}:${Number(count?.count ?? 0) + 1}`
    const expiresAt =
      voucher.benefit_kind === 'pro'
        ? new Date(Date.now() + (voucher.duration_days ?? 30) * 24 * 60 * 60 * 1000)
        : null
    const [bucket] = await transaction<{ id: string }[]>`
      INSERT INTO credit_buckets (
        user_id, kind, source, granted_seconds, remaining_seconds, expires_at
      )
      VALUES (
        ${auth.userId},
        ${voucher.benefit_kind},
        ${source},
        ${voucher.grant_seconds},
        ${voucher.grant_seconds},
        ${expiresAt}
      )
      RETURNING id
    `
    await transaction`
      INSERT INTO voucher_redemptions (voucher_id, user_id, bucket_id)
      VALUES (${voucher.id}, ${auth.userId}, ${bucket!.id})
    `
    await transaction`
      UPDATE vouchers
      SET redemption_count = redemption_count + 1, updated_at = now()
      WHERE id = ${voucher.id}
    `
    await transaction`
      INSERT INTO quota_ledger (
        user_id, bucket_id, delta_seconds, event_type, metadata
      )
      VALUES (
        ${auth.userId}, ${bucket!.id}, ${voucher.grant_seconds},
        'voucher_redeemed', ${transaction.json({ voucherId: voucher.id })}
      )
    `
    return {
      kind: voucher.benefit_kind,
      seconds: voucher.grant_seconds,
      expiresAt: expiresAt?.toISOString() ?? null,
    } as const
  })

  if ('error' in outcome) return context.json(outcome, 400)
  return context.json({ ok: true, benefit: outcome, quota: await quotaSummary(auth.userId) })
}

export async function createAdminGrant(args: {
  userId: string
  kind: 'pro' | 'paid'
  seconds: number
  durationDays?: number
  adminUserId: string
}): Promise<string> {
  return grantCredit({
    userId: args.userId,
    kind: args.kind,
    seconds: args.seconds,
    durationDays: args.durationDays,
    source: `admin:${args.adminUserId}:${Date.now()}:${randomBytes(4).toString('hex')}`,
    actorUserId: args.adminUserId,
  })
}

import type { Context } from 'hono'
import { requireRequestAuth } from './auth'
import { getDatabase } from './db'
import { PRO_PLAN_DAYS, PRO_PLAN_SECONDS, quotaSummary } from './quota'
import { createAdminGrant, generateVoucherCode } from './vouchers'

async function requireAdmin(context: Context) {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return context.json({ error: 'ADMIN_REQUIRED' }, 403)
  return auth
}

export async function adminDashboard(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const sql = getDatabase()
  const [summary] = await sql<{
    users: number
    active_users_24h: number
    active_sessions: number
    stt_seconds_24h: number
    llm_input_tokens_24h: number
    llm_output_tokens_24h: number
    errors_24h: number
    sync_updates_24h: number
  }[]>`
    SELECT
      (SELECT count(*)::integer FROM users WHERE deleted_at IS NULL) AS users,
      (
        SELECT count(DISTINCT user_id)::integer
        FROM device_sessions
        WHERE last_seen_at > now() - interval '24 hours'
      ) AS active_users_24h,
      (
        SELECT count(*)::integer
        FROM active_ai_sessions
        WHERE expires_at > now()
      ) AS active_sessions,
      COALESCE((
        SELECT sum(billed_audio_seconds)
        FROM telemetry_events
        WHERE created_at > now() - interval '24 hours'
      ), 0)::integer AS stt_seconds_24h,
      COALESCE((
        SELECT sum(input_tokens)
        FROM telemetry_events
        WHERE created_at > now() - interval '24 hours'
      ), 0)::integer AS llm_input_tokens_24h,
      COALESCE((
        SELECT sum(output_tokens)
        FROM telemetry_events
        WHERE created_at > now() - interval '24 hours'
      ), 0)::integer AS llm_output_tokens_24h,
      (
        SELECT count(*)::integer
        FROM telemetry_events
        WHERE created_at > now() - interval '24 hours' AND status = 'error'
      ) AS errors_24h,
      (
        SELECT count(*)::integer
        FROM synced_sessions
        WHERE updated_at > now() - interval '24 hours'
      ) AS sync_updates_24h
  `
  const chart = await sql<{
    bucket: Date
    stt_seconds: number
    input_tokens: number
    output_tokens: number
    errors: number
  }[]>`
    SELECT
      date_trunc('hour', created_at) AS bucket,
      COALESCE(sum(billed_audio_seconds), 0)::integer AS stt_seconds,
      COALESCE(sum(input_tokens), 0)::integer AS input_tokens,
      COALESCE(sum(output_tokens), 0)::integer AS output_tokens,
      count(*) FILTER (WHERE status = 'error')::integer AS errors
    FROM telemetry_events
    WHERE created_at > now() - interval '24 hours'
    GROUP BY 1
    ORDER BY 1
  `
  const sttCostCny = Number(summary?.stt_seconds_24h ?? 0) * 0.00033
  const llmCostUsd =
    Number(summary?.llm_input_tokens_24h ?? 0) / 1_000_000 * 0.14
    + Number(summary?.llm_output_tokens_24h ?? 0) / 1_000_000 * 0.28
  return context.json({
    summary: {
      users: Number(summary?.users ?? 0),
      activeUsers24h: Number(summary?.active_users_24h ?? 0),
      activeSessions: Number(summary?.active_sessions ?? 0),
      sttSeconds24h: Number(summary?.stt_seconds_24h ?? 0),
      llmInputTokens24h: Number(summary?.llm_input_tokens_24h ?? 0),
      llmOutputTokens24h: Number(summary?.llm_output_tokens_24h ?? 0),
      errors24h: Number(summary?.errors_24h ?? 0),
      syncUpdates24h: Number(summary?.sync_updates_24h ?? 0),
      estimatedSttCostCny24h: Number(sttCostCny.toFixed(4)),
      estimatedLlmCostUsd24h: Number(llmCostUsd.toFixed(4)),
    },
    chart: chart.map((row) => ({
      at: row.bucket.toISOString(),
      sttSeconds: Number(row.stt_seconds),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      errors: Number(row.errors),
    })),
  })
}

export async function adminListUsers(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const query = (context.req.query('q') ?? '').trim().toLowerCase().slice(0, 100)
  const sql = getDatabase()
  const users = await sql<{
    id: string
    email: string
    status: string
    created_at: Date
    last_seen_at: Date | null
    total_seconds: number
  }[]>`
    SELECT
      users.id,
      users.email,
      users.status,
      users.created_at,
      (
        SELECT max(device_sessions.last_seen_at)
        FROM device_sessions
        WHERE device_sessions.user_id = users.id
      ) AS last_seen_at,
      COALESCE((
        SELECT sum(credit_buckets.remaining_seconds)
        FROM credit_buckets
        WHERE credit_buckets.user_id = users.id
          AND credit_buckets.remaining_seconds > 0
          AND credit_buckets.starts_at <= now()
          AND (credit_buckets.expires_at IS NULL OR credit_buckets.expires_at > now())
      ), 0)::integer AS total_seconds
    FROM users
    WHERE users.deleted_at IS NULL
      AND (${query} = '' OR users.email LIKE ${`%${query}%`})
    ORDER BY users.created_at DESC
    LIMIT 200
  `
  return context.json({
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      status: user.status,
      createdAt: user.created_at.toISOString(),
      lastSeenAt: user.last_seen_at?.toISOString() ?? null,
      totalSeconds: Number(user.total_seconds),
    })),
  })
}

export async function adminUserDetails(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const userId = context.req.param('userId')
  if (!userId) return context.json({ error: 'USER_NOT_FOUND' }, 404)
  const sql = getDatabase()
  const [user] = await sql<{ id: string; email: string; status: string; created_at: Date }[]>`
    SELECT id, email, status, created_at
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
  `
  if (!user) return context.json({ error: 'USER_NOT_FOUND' }, 404)
  const [devices, ledger, quota] = await Promise.all([
    sql<{
      id: string
      device_name: string
      platform: string
      client_version: string
      created_at: Date
      last_seen_at: Date
      revoked_at: Date | null
    }[]>`
      SELECT id, device_name, platform, client_version, last_seen_at, revoked_at
        , created_at
      FROM device_sessions
      WHERE user_id = ${userId}
      ORDER BY last_seen_at DESC
      LIMIT 100
    `,
    sql<{
      id: number
      delta_seconds: number
      event_type: string
      request_id: string | null
      conversation_session_id: string | null
      metadata: unknown
      created_at: Date
    }[]>`
      SELECT id, delta_seconds, event_type, request_id, conversation_session_id, metadata, created_at
      FROM quota_ledger
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 200
    `,
    quotaSummary(userId),
  ])
  return context.json({
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
      createdAt: user.created_at.toISOString(),
    },
    quota,
    devices: devices.map((device) => ({
      id: device.id,
      deviceName: device.device_name,
      platform: device.platform,
      clientVersion: device.client_version,
      createdAt: device.created_at.toISOString(),
      lastSeenAt: device.last_seen_at.toISOString(),
      revokedAt: device.revoked_at?.toISOString() ?? null,
    })),
    ledger: ledger.map((entry) => ({
      id: entry.id,
      deltaSeconds: entry.delta_seconds,
      eventType: entry.event_type,
      requestId: entry.request_id,
      conversationSessionId: entry.conversation_session_id,
      metadata: entry.metadata,
      createdAt: entry.created_at.toISOString(),
    })),
  })
}

export async function adminRevokeDevice(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const userId = context.req.param('userId')
  const deviceId = context.req.param('deviceId')
  if (!userId || !deviceId) return context.json({ error: 'DEVICE_NOT_FOUND' }, 404)
  const sql = getDatabase()
  const rows = await sql<{ id: string }[]>`
    UPDATE device_sessions
    SET revoked_at = now()
    WHERE id = ${deviceId}
      AND user_id = ${userId}
      AND revoked_at IS NULL
    RETURNING id
  `
  if (rows.length === 0) return context.json({ error: 'DEVICE_NOT_FOUND' }, 404)
  await sql`
    DELETE FROM active_ai_sessions
    WHERE user_id = ${userId} AND device_session_id = ${deviceId}
  `
  return context.json({ ok: true })
}

export async function adminSetUserStatus(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const userId = context.req.param('userId')
  if (!userId) return context.json({ error: 'USER_NOT_FOUND' }, 404)
  const body = (await context.req.json().catch(() => null)) as { status?: unknown } | null
  if (body?.status !== 'active' && body?.status !== 'banned') {
    return context.json({ error: 'INVALID_STATUS' }, 400)
  }
  const status = body.status
  const sql = getDatabase()
  const rows = await sql`
    UPDATE users
    SET status = ${status}, updated_at = now()
    WHERE id = ${userId} AND deleted_at IS NULL
    RETURNING id
  `
  if (rows.length === 0) return context.json({ error: 'USER_NOT_FOUND' }, 404)
  if (status === 'banned') {
    await sql`UPDATE device_sessions SET revoked_at = now() WHERE user_id = ${userId}`
    await sql`DELETE FROM active_ai_sessions WHERE user_id = ${userId}`
  }
  return context.json({ ok: true })
}

export async function adminGrant(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const userId = context.req.param('userId')
  if (!userId) return context.json({ error: 'USER_NOT_FOUND' }, 404)
  const body = (await context.req.json().catch(() => null)) as {
    kind?: unknown
    seconds?: unknown
    durationDays?: unknown
  } | null
  if (body?.kind !== 'pro' && body?.kind !== 'paid') {
    return context.json({ error: 'INVALID_GRANT_KIND' }, 400)
  }
  const seconds = Number(body.seconds)
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 10_000_000) {
    return context.json({ error: 'INVALID_GRANT_SECONDS' }, 400)
  }
  const durationDays =
    body.kind === 'pro' ? Math.max(1, Math.min(365, Number(body.durationDays) || PRO_PLAN_DAYS)) : undefined
  try {
    const bucketId = await createAdminGrant({
      userId,
      kind: body.kind,
      seconds,
      durationDays,
      adminUserId: auth.userId,
    })
    return context.json({ ok: true, bucketId, quota: await quotaSummary(userId) })
  } catch (cause) {
    return context.json(
      { error: 'GRANT_FAILED', message: cause instanceof Error ? cause.message : String(cause) },
      400,
    )
  }
}

export async function adminListVouchers(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const sql = getDatabase()
  const vouchers = await sql`
    SELECT
      id, code, name, benefit_kind, grant_seconds, duration_days,
      max_redemptions, per_user_limit, redemption_count, active,
      valid_from, valid_until, created_at, updated_at
    FROM vouchers
    ORDER BY created_at DESC
    LIMIT 500
  `
  return context.json({ vouchers })
}

export async function adminCreateVoucher(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const body = (await context.req.json().catch(() => null)) as {
    code?: unknown
    name?: unknown
    benefitKind?: unknown
    grantSeconds?: unknown
    durationDays?: unknown
    maxRedemptions?: unknown
    perUserLimit?: unknown
    validUntil?: unknown
  } | null
  const benefitKind = body?.benefitKind === 'paid' ? 'paid' : 'pro'
  const code =
    typeof body?.code === 'string' && body.code.trim()
      ? body.code.trim().toUpperCase().replace(/\s+/g, '')
      : generateVoucherCode()
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) {
    return context.json({ error: 'INVALID_VOUCHER_CODE' }, 400)
  }
  const name =
    typeof body?.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 100)
      : '比赛兑换码'
  const grantSeconds = Number(body?.grantSeconds ?? (benefitKind === 'pro' ? PRO_PLAN_SECONDS : 120 * 60))
  const maxRedemptions = Number(body?.maxRedemptions ?? 1)
  const perUserLimit = Number(body?.perUserLimit ?? 1)
  const durationDays =
    benefitKind === 'pro' ? Number(body?.durationDays ?? PRO_PLAN_DAYS) : null
  const validUntil =
    typeof body?.validUntil === 'string' && body.validUntil ? new Date(body.validUntil) : null
  if (
    !Number.isInteger(grantSeconds)
    || grantSeconds <= 0
    || !Number.isInteger(maxRedemptions)
    || maxRedemptions <= 0
    || !Number.isInteger(perUserLimit)
    || perUserLimit <= 0
    || (durationDays !== null && (!Number.isInteger(durationDays) || durationDays <= 0))
    || (validUntil && Number.isNaN(validUntil.getTime()))
  ) {
    return context.json({ error: 'INVALID_VOUCHER_CONFIG' }, 400)
  }
  const sql = getDatabase()
  try {
    const [voucher] = await sql`
      INSERT INTO vouchers (
        code, name, benefit_kind, grant_seconds, duration_days,
        max_redemptions, per_user_limit, valid_until, created_by
      )
      VALUES (
        ${code}, ${name}, ${benefitKind}, ${grantSeconds}, ${durationDays},
        ${maxRedemptions}, ${perUserLimit}, ${validUntil}, ${auth.userId}
      )
      RETURNING *
    `
    return context.json({ voucher }, 201)
  } catch (cause) {
    return context.json(
      { error: 'VOUCHER_CREATE_FAILED', message: cause instanceof Error ? cause.message : String(cause) },
      400,
    )
  }
}

export async function adminUpdateVoucher(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const voucherId = context.req.param('voucherId')
  if (!voucherId) return context.json({ error: 'VOUCHER_NOT_FOUND' }, 404)
  const body = (await context.req.json().catch(() => null)) as {
    active?: unknown
    maxRedemptions?: unknown
    validUntil?: unknown
  } | null
  const active = typeof body?.active === 'boolean' ? body.active : null
  const maxRedemptions = Number.isInteger(Number(body?.maxRedemptions))
    ? Number(body?.maxRedemptions)
    : null
  const validUntil =
    body?.validUntil === null
      ? null
      : typeof body?.validUntil === 'string'
        ? new Date(body.validUntil)
        : undefined
  if (active === null && maxRedemptions === null && validUntil === undefined) {
    return context.json({ error: 'NO_CHANGES' }, 400)
  }
  if (maxRedemptions !== null && maxRedemptions <= 0) {
    return context.json({ error: 'INVALID_MAX_REDEMPTIONS' }, 400)
  }
  if (validUntil instanceof Date && Number.isNaN(validUntil.getTime())) {
    return context.json({ error: 'INVALID_VALID_UNTIL' }, 400)
  }
  const sql = getDatabase()
  const rows = await sql`
    UPDATE vouchers
    SET
      active = COALESCE(${active}, active),
      max_redemptions = COALESCE(${maxRedemptions}, max_redemptions),
      valid_until = CASE
        WHEN ${validUntil === undefined} THEN valid_until
        ELSE ${validUntil ?? null}
      END,
      updated_at = now()
    WHERE id = ${voucherId}
    RETURNING *
  `
  if (rows.length === 0) return context.json({ error: 'VOUCHER_NOT_FOUND' }, 404)
  return context.json({ voucher: rows[0] })
}

export async function adminLedger(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const sql = getDatabase()
  const ledger = await sql`
    SELECT
      quota_ledger.id,
      users.email,
      quota_ledger.delta_seconds,
      quota_ledger.event_type,
      quota_ledger.request_id,
      quota_ledger.conversation_session_id,
      quota_ledger.metadata,
      quota_ledger.created_at
    FROM quota_ledger
    JOIN users ON users.id = quota_ledger.user_id
    ORDER BY quota_ledger.created_at DESC
    LIMIT 500
  `
  return context.json({ ledger })
}

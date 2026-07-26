import { randomInt } from 'node:crypto'
import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { databaseConfigured, getDatabase } from './db'
import { hashToken, keyedHash, randomToken, safeHashEqual } from './crypto'
import {
  ensureMonthlyFreeBucket,
  FREE_MONTHLY_SECONDS,
  quotaSummary,
} from './quota'

export const SESSION_COOKIE = 'kibotalk_session'
const SESSION_DAYS = 90
const OTP_TTL_MINUTES = 10
const OTP_MAX_ATTEMPTS = 6

export type RequestAuth = {
  userId: string
  email: string
  deviceSessionId: string
  platform: 'web' | 'macos'
  clientVersion: string
  isAdmin: boolean
}

type UserRow = {
  id: string
  email: string
  status: 'active' | 'banned'
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

function clientIp(context: Context): string {
  return (
    context.req.header('cf-connecting-ip')
    ?? context.req.header('x-real-ip')
    ?? context.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  )
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.APP_ENV === 'production',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  }
}

function bearerToken(context: Context): string | null {
  const header = context.req.header('authorization')
  if (header?.startsWith('Bearer ')) return header.slice(7).trim()
  return getCookie(context, SESSION_COOKIE) ?? null
}

export function isTestAuthBypass(): boolean {
  return (
    process.env.NODE_ENV === 'test'
    || Boolean(process.env.VITEST)
    || (process.env.APP_ENV !== 'production' && process.env.AUTH_DISABLED === 'true')
    || (!process.env.DATABASE_URL && process.env.APP_ENV !== 'production')
  )
}

export async function authenticateRequest(context: Context): Promise<RequestAuth | null> {
  if (isTestAuthBypass()) {
    return {
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'test@kibotalk.app',
      deviceSessionId: '00000000-0000-0000-0000-000000000002',
      platform: 'web',
      clientVersion: 'test',
      isAdmin: true,
    }
  }
  const token = bearerToken(context)
  if (!token) return null
  const sql = getDatabase()
  const [row] = await sql<{
    user_id: string
    email: string
    status: 'active' | 'banned'
    device_session_id: string
    platform: 'web' | 'macos'
    client_version: string
  }[]>`
    SELECT
      users.id AS user_id,
      users.email,
      users.status,
      device_sessions.id AS device_session_id,
      device_sessions.platform,
      device_sessions.client_version
    FROM device_sessions
    JOIN users ON users.id = device_sessions.user_id
    WHERE device_sessions.token_hash = ${hashToken(token)}
      AND device_sessions.revoked_at IS NULL
      AND device_sessions.expires_at > now()
      AND users.deleted_at IS NULL
    LIMIT 1
  `
  if (!row || row.status !== 'active') return null
  void sql`
    UPDATE device_sessions
    SET last_seen_at = now()
    WHERE id = ${row.device_session_id}
      AND last_seen_at < now() - interval '5 minutes'
  `.catch(() => {})
  return {
    userId: row.user_id,
    email: row.email,
    deviceSessionId: row.device_session_id,
    platform: row.platform,
    clientVersion: row.client_version,
    isAdmin: adminEmails().has(row.email),
  }
}

export async function requireRequestAuth(context: Context): Promise<RequestAuth | Response> {
  try {
    const auth = await authenticateRequest(context)
    if (!auth) return context.json({ error: 'AUTH_REQUIRED' }, 401)
    return auth
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return context.json({ error: 'AUTH_UNAVAILABLE', message }, 503)
  }
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.ALLOW_DEV_OTP === 'true') return
    throw new Error('RESEND_API_KEY is not set')
  }
  const fromName = process.env.RESEND_FROM_NAME ?? 'KiboTalk'
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'login@kibotalk.app'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [email],
      subject: '你的 KiboTalk 登录验证码',
      text: `你的验证码是 ${code}，${OTP_TTL_MINUTES} 分钟内有效。若非本人操作，请忽略此邮件。`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.6"><h2>KiboTalk 登录验证码</h2><p>你的验证码是：</p><p style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</p><p>${OTP_TTL_MINUTES} 分钟内有效。若非本人操作，请忽略此邮件。</p></div>`,
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Resend HTTP ${response.status}: ${body.slice(0, 200)}`)
  }
}

export async function requestOtp(context: Context): Promise<Response> {
  const body = (await context.req.json().catch(() => null)) as { email?: unknown } | null
  const email = normalizeEmail(body?.email)
  if (!email) return context.json({ error: 'INVALID_EMAIL' }, 400)
  const sql = getDatabase()
  const ipHash = keyedHash(`otp-ip:${clientIp(context)}`)
  const [limits] = await sql<{ email_count: number; ip_count: number; recent_count: number }[]>`
    SELECT
      count(*) FILTER (WHERE email = ${email} AND created_at > now() - interval '1 hour')::integer AS email_count,
      count(*) FILTER (WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour')::integer AS ip_count,
      count(*) FILTER (WHERE email = ${email} AND created_at > now() - interval '60 seconds')::integer AS recent_count
    FROM otp_codes
    WHERE created_at > now() - interval '1 hour'
      AND (email = ${email} OR ip_hash = ${ipHash})
  `
  if (Number(limits?.recent_count ?? 0) > 0) {
    return context.json({ error: 'OTP_TOO_FREQUENT', retryAfterSeconds: 60 }, 429)
  }
  if (Number(limits?.email_count ?? 0) >= 5 || Number(limits?.ip_count ?? 0) >= 20) {
    return context.json({ error: 'OTP_RATE_LIMITED', retryAfterSeconds: 3600 }, 429)
  }
  const [existing] = await sql<UserRow[]>`
    SELECT id, email, status
    FROM users
    WHERE email = ${email} AND deleted_at IS NULL
  `
  if (existing?.status === 'banned') return context.json({ error: 'ACCOUNT_BANNED' }, 403)

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
  await sql`
    INSERT INTO otp_codes (email, code_hash, ip_hash, expires_at)
    VALUES (
      ${email},
      ${keyedHash(`otp:${email}:${code}`)},
      ${ipHash},
      ${expiresAt}
    )
  `
  try {
    await sendOtpEmail(email, code)
  } catch (cause) {
    await sql`
      UPDATE otp_codes
      SET consumed_at = now()
      WHERE email = ${email} AND consumed_at IS NULL
    `
    const message = cause instanceof Error ? cause.message : String(cause)
    return context.json({ error: 'EMAIL_DELIVERY_FAILED', message }, 502)
  }
  return context.json({
    ok: true,
    expiresInSeconds: OTP_TTL_MINUTES * 60,
    ...(process.env.ALLOW_DEV_OTP === 'true' ? { developmentCode: code } : {}),
  })
}

export async function verifyOtp(context: Context): Promise<Response> {
  const body = (await context.req.json().catch(() => null)) as {
    email?: unknown
    code?: unknown
    deviceName?: unknown
    platform?: unknown
    clientVersion?: unknown
  } | null
  const email = normalizeEmail(body?.email)
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!email || !/^\d{6}$/.test(code)) {
    return context.json({ error: 'INVALID_OTP' }, 400)
  }
  const platform = body?.platform === 'macos' ? 'macos' : 'web'
  const deviceName =
    typeof body?.deviceName === 'string' && body.deviceName.trim()
      ? body.deviceName.trim().slice(0, 100)
      : platform === 'macos'
        ? 'Mac'
        : 'Web 浏览器'
  const clientVersion =
    typeof body?.clientVersion === 'string' && body.clientVersion.trim()
      ? body.clientVersion.trim().slice(0, 40)
      : 'web'
  const sql = getDatabase()

  const result = await sql.begin(async (transaction) => {
    const [otp] = await transaction<{
      id: string
      code_hash: string
      attempts: number
    }[]>`
      SELECT id, code_hash, attempts
      FROM otp_codes
      WHERE email = ${email}
        AND consumed_at IS NULL
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return null
    const suppliedHash = keyedHash(`otp:${email}:${code}`)
    if (!safeHashEqual(suppliedHash, otp.code_hash)) {
      await transaction`
        UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ${otp.id}
      `
      return null
    }
    await transaction`
      UPDATE otp_codes
      SET consumed_at = now()
      WHERE email = ${email} AND consumed_at IS NULL
    `
    const [user] = await transaction<UserRow[]>`
      INSERT INTO users (email)
      VALUES (${email})
      ON CONFLICT (email) DO UPDATE SET updated_at = now()
      RETURNING id, email, status
    `
    if (!user || user.status !== 'active') return { banned: true } as const
    const token = randomToken()
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
    const [session] = await transaction<{ id: string }[]>`
      INSERT INTO device_sessions (
        user_id, token_hash, device_name, platform, client_version, expires_at
      )
      VALUES (
        ${user.id}, ${hashToken(token)}, ${deviceName}, ${platform},
        ${clientVersion}, ${expiresAt}
      )
      RETURNING id
    `
    return { user, token, deviceSessionId: session!.id } as const
  })

  if (!result) return context.json({ error: 'INVALID_OTP' }, 400)
  if ('banned' in result) return context.json({ error: 'ACCOUNT_BANNED' }, 403)
  await ensureMonthlyFreeBucket(result.user.id)
  setCookie(context, SESSION_COOKIE, result.token, cookieOptions())
  return context.json({
    accessToken: result.token,
    user: {
      id: result.user.id,
      email: result.user.email,
      isAdmin: adminEmails().has(result.user.email),
    },
    deviceSessionId: result.deviceSessionId,
    quota: await quotaSummary(result.user.id),
  })
}

export async function authMe(context: Context): Promise<Response> {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  if (!databaseConfigured()) {
    return context.json({
      user: { id: auth.userId, email: auth.email, isAdmin: auth.isAdmin },
      deviceSessionId: auth.deviceSessionId,
      quota: {
        freeSeconds: FREE_MONTHLY_SECONDS,
        proSeconds: 0,
        paidSeconds: 0,
        totalSeconds: FREE_MONTHLY_SECONDS,
        proUntil: null,
        resetsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      developmentBypass: true,
    })
  }
  return context.json({
    user: { id: auth.userId, email: auth.email, isAdmin: auth.isAdmin },
    deviceSessionId: auth.deviceSessionId,
    quota: await quotaSummary(auth.userId),
  })
}

export async function logout(context: Context): Promise<Response> {
  const auth = await requireRequestAuth(context)
  if (!(auth instanceof Response)) {
    const sql = getDatabase()
    await sql`
      UPDATE device_sessions SET revoked_at = now()
      WHERE id = ${auth.deviceSessionId}
    `
    await sql`DELETE FROM active_ai_sessions WHERE device_session_id = ${auth.deviceSessionId}`
  }
  setCookie(context, SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
  return context.json({ ok: true })
}

export async function listDevices(context: Context): Promise<Response> {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  const sql = getDatabase()
  const devices = await sql<{
    id: string
    device_name: string
    platform: string
    client_version: string
    created_at: Date
    last_seen_at: Date
    current: boolean
  }[]>`
    SELECT
      id,
      device_name,
      platform,
      client_version,
      created_at,
      last_seen_at,
      (id = ${auth.deviceSessionId}) AS current
    FROM device_sessions
    WHERE user_id = ${auth.userId}
      AND revoked_at IS NULL
      AND expires_at > now()
    ORDER BY last_seen_at DESC
  `
  return context.json({
    devices: devices.map((device) => ({
      id: device.id,
      deviceName: device.device_name,
      platform: device.platform,
      clientVersion: device.client_version,
      createdAt: device.created_at.toISOString(),
      lastSeenAt: device.last_seen_at.toISOString(),
      current: device.current,
    })),
  })
}

export async function revokeDevice(context: Context): Promise<Response> {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  const deviceId = context.req.param('deviceId')
  if (!deviceId) return context.json({ error: 'DEVICE_NOT_FOUND' }, 404)
  const sql = getDatabase()
  const revoked = await sql<{ id: string }[]>`
    UPDATE device_sessions
    SET revoked_at = now()
    WHERE id = ${deviceId}
      AND user_id = ${auth.userId}
      AND revoked_at IS NULL
    RETURNING id
  `
  if (revoked.length === 0) return context.json({ error: 'DEVICE_NOT_FOUND' }, 404)
  await sql`DELETE FROM active_ai_sessions WHERE device_session_id = ${deviceId}`
  if (deviceId === auth.deviceSessionId) {
    setCookie(context, SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
  }
  return context.json({ ok: true, currentDeviceRevoked: deviceId === auth.deviceSessionId })
}

export async function issueWebsocketTicket(context: Context): Promise<Response> {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  if (!databaseConfigured()) {
    return context.json({ ticket: 'development', expiresInSeconds: 3600 })
  }
  const token = randomToken(24)
  const sql = getDatabase()
  await sql`
    INSERT INTO websocket_tickets (
      token_hash, user_id, device_session_id, expires_at
    )
    VALUES (
      ${hashToken(token)}, ${auth.userId}, ${auth.deviceSessionId},
      now() + interval '60 seconds'
    )
  `
  return context.json({ ticket: token, expiresInSeconds: 60 })
}

export async function consumeWebsocketTicket(token: string): Promise<{
  userId: string
  deviceSessionId: string
  platform: 'web' | 'macos'
  clientVersion: string
} | null> {
  if (isTestAuthBypass() && !databaseConfigured() && token === 'development') {
    return {
      userId: '00000000-0000-0000-0000-000000000001',
      deviceSessionId: '00000000-0000-0000-0000-000000000002',
      platform: 'web',
      clientVersion: 'development',
    }
  }
  const sql = getDatabase()
  const [ticket] = await sql<{
    user_id: string
    device_session_id: string
    platform: 'web' | 'macos'
    client_version: string
  }[]>`
    UPDATE websocket_tickets
    SET consumed_at = now()
    FROM device_sessions, users
    WHERE websocket_tickets.token_hash = ${hashToken(token)}
      AND websocket_tickets.consumed_at IS NULL
      AND websocket_tickets.expires_at > now()
      AND device_sessions.id = websocket_tickets.device_session_id
      AND device_sessions.revoked_at IS NULL
      AND device_sessions.expires_at > now()
      AND users.id = websocket_tickets.user_id
      AND users.status = 'active'
      AND users.deleted_at IS NULL
    RETURNING
      websocket_tickets.user_id,
      websocket_tickets.device_session_id,
      device_sessions.platform,
      device_sessions.client_version
  `
  return ticket
    ? {
        userId: ticket.user_id,
        deviceSessionId: ticket.device_session_id,
        platform: ticket.platform,
        clientVersion: ticket.client_version,
      }
    : null
}

export async function deleteAccount(context: Context): Promise<Response> {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  const body = (await context.req.json().catch(() => null)) as { confirmation?: unknown } | null
  if (body?.confirmation !== 'DELETE') {
    return context.json({ error: 'DELETE_CONFIRMATION_REQUIRED' }, 400)
  }
  const sql = getDatabase()
  await sql.begin(async (transaction) => {
    await transaction`DELETE FROM otp_codes WHERE email = ${auth.email}`
    await transaction`DELETE FROM users WHERE id = ${auth.userId}`
  })
  setCookie(context, SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
  return context.json({ ok: true })
}

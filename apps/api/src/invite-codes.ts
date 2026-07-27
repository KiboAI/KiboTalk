import type { Context } from 'hono'
import { generateAccessCode, normalizeAccessCode } from './access-code'
import { requireRequestAuth } from './auth'
import { getDatabase } from './db'

async function requireAdmin(context: Context) {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  if (!auth.isAdmin) return context.json({ error: 'ADMIN_REQUIRED' }, 403)
  return auth
}

export async function adminListInviteCodes(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const sql = getDatabase()
  const inviteCodes = await sql`
    SELECT
      id, code, name, max_uses, use_count, active,
      valid_from, valid_until, created_at, updated_at
    FROM invite_codes
    ORDER BY created_at DESC
    LIMIT 500
  `
  return context.json({ inviteCodes })
}

export async function adminCreateInviteCode(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const body = (await context.req.json().catch(() => null)) as {
    code?: unknown
    name?: unknown
    maxUses?: unknown
    validUntil?: unknown
  } | null
  const code =
    typeof body?.code === 'string' && body.code.trim()
      ? normalizeAccessCode(body.code)
      : generateAccessCode()
  const name =
    typeof body?.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 100)
      : '内测邀请码'
  const maxUses = Number(body?.maxUses ?? 100)
  const validUntil =
    typeof body?.validUntil === 'string' && body.validUntil
      ? new Date(body.validUntil)
      : null
  if (
    !code
    || !Number.isInteger(maxUses)
    || maxUses <= 0
    || (validUntil && Number.isNaN(validUntil.getTime()))
  ) return context.json({ error: 'INVALID_INVITE_CODE_CONFIG' }, 400)

  const sql = getDatabase()
  try {
    const [inviteCode] = await sql`
      INSERT INTO invite_codes (
        code, name, max_uses, valid_until, created_by
      )
      VALUES (
        ${code}, ${name}, ${maxUses}, ${validUntil}, ${auth.userId}
      )
      RETURNING *
    `
    return context.json({ inviteCode }, 201)
  } catch (cause) {
    return context.json({
      error: 'INVITE_CODE_CREATE_FAILED',
      message: cause instanceof Error ? cause.message : String(cause),
    }, 400)
  }
}

export async function adminUpdateInviteCode(context: Context): Promise<Response> {
  const auth = await requireAdmin(context)
  if (auth instanceof Response) return auth
  const inviteCodeId = context.req.param('inviteCodeId')
  if (!inviteCodeId) return context.json({ error: 'INVITE_CODE_NOT_FOUND' }, 404)
  const body = (await context.req.json().catch(() => null)) as {
    active?: unknown
    maxUses?: unknown
    validUntil?: unknown
  } | null
  const active = typeof body?.active === 'boolean' ? body.active : null
  const maxUses = Number.isInteger(Number(body?.maxUses))
    ? Number(body?.maxUses)
    : null
  const validUntil =
    body?.validUntil === null
      ? null
      : typeof body?.validUntil === 'string'
        ? new Date(body.validUntil)
        : undefined
  if (active === null && maxUses === null && validUntil === undefined) {
    return context.json({ error: 'NO_CHANGES' }, 400)
  }
  if (maxUses !== null && maxUses <= 0) {
    return context.json({ error: 'INVALID_MAX_USES' }, 400)
  }
  if (validUntil instanceof Date && Number.isNaN(validUntil.getTime())) {
    return context.json({ error: 'INVALID_VALID_UNTIL' }, 400)
  }

  const sql = getDatabase()
  const rows = await sql`
    UPDATE invite_codes
    SET
      active = COALESCE(${active}, active),
      max_uses = COALESCE(${maxUses}, max_uses),
      valid_until = CASE
        WHEN ${validUntil === undefined} THEN valid_until
        ELSE ${validUntil ?? null}
      END,
      updated_at = now()
    WHERE id = ${inviteCodeId}
      AND (${maxUses}::integer IS NULL OR ${maxUses} >= use_count)
    RETURNING *
  `
  return rows[0]
    ? context.json({ inviteCode: rows[0] })
    : context.json({ error: 'INVITE_CODE_NOT_FOUND_OR_BELOW_USE_COUNT' }, 404)
}

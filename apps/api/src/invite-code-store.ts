import type { Sql, TransactionSql } from 'postgres'
import { normalizeAccessCode } from './access-code'

export type InviteCodeError =
  | 'INVITE_CODE_REQUIRED'
  | 'INVITE_CODE_UNAVAILABLE'
  | 'INVITE_CODE_EXHAUSTED'

type SqlClient = Sql | TransactionSql

export async function findAvailableInviteCode(
  sql: SqlClient,
  value: unknown,
): Promise<{ id: string } | { error: InviteCodeError }> {
  const code = normalizeAccessCode(value)
  if (!code) return { error: 'INVITE_CODE_REQUIRED' }
  const rows = await sql<{
    id: string
    active: boolean
    max_uses: number
    use_count: number
  }[]>`
    SELECT id, active, max_uses, use_count
    FROM invite_codes
    WHERE code = ${code}
      AND valid_from <= now()
      AND (valid_until IS NULL OR valid_until > now())
    FOR UPDATE
  `
  const invite = rows[0]
  if (!invite || !invite.active) return { error: 'INVITE_CODE_UNAVAILABLE' }
  if (invite.use_count >= invite.max_uses) return { error: 'INVITE_CODE_EXHAUSTED' }
  return { id: invite.id }
}

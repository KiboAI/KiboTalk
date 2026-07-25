import { serve } from '@hono/node-server'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import type { Server } from 'node:http'
import { app } from './app'
import { closeDatabase, databaseConfigured, getDatabase } from './db'
import { migrateDatabase } from './migrations'
import { attachSttRealtimeUpgrade } from './stt-realtime'

// Load repo-root .env (apps/api/src → ../../../ = repo root) so `pnpm dev:api`
// picks up STT_* / LLM_* without manually exporting shell vars. Tests import
// `app` directly and set process.env themselves, so this never runs in tests.
const developmentEnvPath = resolve(process.cwd(), '../../.env')
if (process.env.APP_ENV !== 'production' && existsSync(developmentEnvPath)) {
  loadEnvFile(developmentEnvPath)
}

const port = Number(process.env.PORT ?? 8787)

if (process.env.APP_ENV === 'production') {
  const required = [
    'DATABASE_URL',
    'AUTH_SECRET',
    'SYNC_ENCRYPTION_KEY',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'RESEND_FROM_NAME',
    'ADMIN_EMAILS',
    'STT_ACTIVE',
    'STT_DASHSCOPE_API_KEY',
    'STT_DASHSCOPE_WS_URL',
    'STT_DASHSCOPE_REALTIME_MODEL',
    'LLM_ACTIVE',
  ] as const
  const missing = required.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`Missing production environment variables: ${missing.join(', ')}`)
  }
  if (process.env.AUTH_DISABLED === 'true' || process.env.ALLOW_DEV_OTP === 'true') {
    throw new Error('Development authentication bypasses are forbidden in production')
  }
  if (process.env.STT_ACTIVE !== 'dashscope-realtime') {
    throw new Error('Production STT provider must be dashscope-realtime')
  }
  if (process.env.STT_DASHSCOPE_REALTIME_MODEL !== 'qwen3-asr-flash-realtime') {
    throw new Error('Production STT model must be qwen3-asr-flash-realtime')
  }
  const llmGroup = `LLM_${process.env.LLM_ACTIVE!.toUpperCase()}_`
  const llmRequired = [`${llmGroup}BASE_URL`, `${llmGroup}API_KEY`, `${llmGroup}MODEL`]
  const missingLlm = llmRequired.filter((name) => !process.env[name])
  if (missingLlm.length > 0) {
    throw new Error(`Missing production environment variables: ${missingLlm.join(', ')}`)
  }
  if (process.env[`${llmGroup}MODEL`] !== 'deepseek-v4-flash') {
    throw new Error('Production LLM model must be deepseek-v4-flash')
  }
  if (process.env.LLM_THINKING === 'enabled') {
    throw new Error('Production LLM thinking must be disabled')
  }
}

// Client abort mid-SSE used to reject as an unhandled promise and kill the
// process (Node ≥15 default). Swallow that specific rejection so the proxy stays up.
process.on('unhandledRejection', (reason) => {
  const text = reason instanceof Error ? reason.message : String(reason)
  if (text.includes('Client connection prematurely closed')) return
  console.error('unhandledRejection', reason)
  process.exit(1)
})

async function main(): Promise<void> {
  if (databaseConfigured()) {
    await migrateDatabase()
    const sql = getDatabase()
    const pruneExpiredRecords = async () => {
      await sql`DELETE FROM telemetry_events WHERE created_at < now() - interval '30 days'`
      await sql`DELETE FROM otp_codes WHERE created_at < now() - interval '24 hours'`
      await sql`DELETE FROM websocket_tickets WHERE expires_at < now() - interval '1 hour'`
      await sql`DELETE FROM active_ai_sessions WHERE expires_at <= now()`
      await sql`DELETE FROM final_ai_allowances WHERE expires_at <= now()`
    }
    await pruneExpiredRecords()
    setInterval(() => {
      void pruneExpiredRecords().catch(() => {})
    }, 24 * 60 * 60 * 1000).unref()
  }

  const server = serve({ fetch: app.fetch, port }, (info) => {
    // eslint-disable-next-line no-console
    console.log(`api listening on http://localhost:${info.port}`)
  }) as Server
  attachSttRealtimeUpgrade(server)

  async function shutdown(): Promise<void> {
    server.close()
    await closeDatabase()
  }

  process.once('SIGTERM', () => void shutdown())
  process.once('SIGINT', () => void shutdown())
}

void main().catch((cause) => {
  console.error('api startup failed', cause)
  process.exit(1)
})

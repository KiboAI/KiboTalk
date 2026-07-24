import { serve } from '@hono/node-server'
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Server } from 'node:http'
import { app } from './app'
import { attachSttRealtimeUpgrade } from './stt-realtime'

// Load repo-root .env (apps/api/src → ../../../ = repo root) so `pnpm dev:api`
// picks up STT_* / LLM_* without manually exporting shell vars. Tests import
// `app` directly and set process.env themselves, so this never runs in tests.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

const port = Number(process.env.PORT ?? 8787)

// Client abort mid-SSE used to reject as an unhandled promise and kill the
// process (Node ≥15 default). Swallow that specific rejection so the proxy stays up.
process.on('unhandledRejection', (reason) => {
  const text = reason instanceof Error ? reason.message : String(reason)
  if (text.includes('Client connection prematurely closed')) return
  console.error('unhandledRejection', reason)
  process.exit(1)
})

const server = serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`api listening on http://localhost:${info.port}`)
}) as Server

attachSttRealtimeUpgrade(server)

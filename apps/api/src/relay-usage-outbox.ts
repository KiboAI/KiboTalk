import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { RelayUsageEvent } from '@kibotalk/shared'

const queued = new Map<string, RelayUsageEvent>()
let loaded = false
let mutation = Promise.resolve()
let flushing: Promise<void> | null = null

function outboxPath(env: NodeJS.ProcessEnv): string {
  return env.RELAY_OUTBOX_PATH
    ?? (env.APP_ENV === 'production'
      ? '/app/data/usage-outbox.json'
      : '/tmp/kibotalk-relay-usage-outbox.json')
}

export async function initializeRelayUsageOutbox(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const data = JSON.parse(await readFile(outboxPath(env), 'utf8')) as unknown
    if (!Array.isArray(data)) return
    for (const value of data) {
      if (
        value
        && typeof value === 'object'
        && typeof (value as RelayUsageEvent).requestId === 'string'
      ) {
        const event = value as RelayUsageEvent
        queued.set(event.requestId, event)
      }
    }
  } catch {
    // A missing or invalid outbox starts empty. Future writes replace it atomically.
  }
}

async function persistOutbox(env: NodeJS.ProcessEnv): Promise<void> {
  const path = outboxPath(env)
  const temporaryPath = `${path}.next`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporaryPath, JSON.stringify([...queued.values()]), {
    encoding: 'utf8',
    mode: 0o600,
  })
  await rename(temporaryPath, path)
}

function serializeMutation(operation: () => Promise<void>): Promise<void> {
  mutation = mutation.then(operation, operation)
  return mutation
}

export async function enqueueRelayUsage(
  event: RelayUsageEvent,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await initializeRelayUsageOutbox(env)
  queued.set(event.requestId, event)
  await serializeMutation(() => persistOutbox(env))
}

async function sendUsage(
  event: RelayUsageEvent,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof globalThis.fetch,
): Promise<boolean> {
  const origin = env.RELAY_PRIMARY_ORIGIN ?? env.PUBLIC_APP_URL
  const secret = env.RELAY_NODE_SECRET
  if (!origin || !secret) return false
  try {
    const response = await fetchImpl(
      new URL('/api/internal/relay/usage', origin),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(event),
      },
    )
    return response.ok
  } catch {
    return false
  }
}

export async function flushRelayUsageOutbox(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    await initializeRelayUsageOutbox(env)
    let changed = false
    for (const event of [...queued.values()]) {
      if (!await sendUsage(event, env, fetchImpl)) break
      queued.delete(event.requestId)
      changed = true
    }
    if (changed) await serializeMutation(() => persistOutbox(env))
  })().finally(() => {
    flushing = null
  })
  return flushing
}

export function pendingRelayUsageSeconds(
  userId: string,
  conversationSessionId: string,
): number {
  return [...queued.values()]
    .filter((event) =>
      event.userId === userId
      && event.conversationSessionId === conversationSessionId)
    .reduce((sum, event) => sum + Math.max(1, Math.ceil(event.audioSeconds)), 0)
}

export function resetRelayUsageOutboxForTests(): void {
  queued.clear()
  loaded = false
  mutation = Promise.resolve()
  flushing = null
}

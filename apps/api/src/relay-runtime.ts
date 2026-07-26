import type { ServerRole } from './server-role'
import {
  relayAcceptingNewSessions,
  relayNodeId,
} from './server-role'
import { providerHealthy, refreshProviderHealth } from './provider-health'
import { activeRelaySessions } from './relay-session-state'
import { flushRelayUsageOutbox } from './relay-usage-outbox'

async function sendHeartbeat(env: NodeJS.ProcessEnv): Promise<void> {
  const origin = env.RELAY_PRIMARY_ORIGIN ?? env.PUBLIC_APP_URL
  const secret = env.RELAY_NODE_SECRET
  if (!origin || !secret) return
  await fetch(new URL('/api/internal/relay/heartbeat', origin), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      nodeId: relayNodeId(env),
      acceptingNewSessions: relayAcceptingNewSessions(env),
      providerHealthy: providerHealthy(),
      version: env.APP_VERSION ?? 'development',
      activeSessions: activeRelaySessions(),
    }),
  }).catch(() => null)
}

export function startRelayRuntime(
  role: ServerRole,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  void refreshProviderHealth(env).catch(() => false)
  const healthTimer = setInterval(() => {
    void refreshProviderHealth(env).catch(() => false)
  }, 30_000)
  healthTimer.unref()

  if (role === 'primary') {
    return () => clearInterval(healthTimer)
  }

  const maintainRelay = () => {
    void Promise.all([
      sendHeartbeat(env),
      flushRelayUsageOutbox(env),
    ])
  }
  maintainRelay()
  const relayTimer = setInterval(maintainRelay, 15_000)
  relayTimer.unref()
  return () => {
    clearInterval(healthTimer)
    clearInterval(relayTimer)
  }
}

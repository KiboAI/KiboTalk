import type {
  RelayNode,
  RelayNodeList,
  RelaySessionGrant,
} from '@kibotalk/shared'
import type { RelayProbeResult } from './relay-routing'

const PRODUCTION_API_ORIGIN = 'https://app.kibotalk.app'

type DesktopBridge = {
  auth?: {
    getAccessToken: () => Promise<string | null>
    setAccessToken: (token: string) => Promise<void>
    clearAccessToken: () => Promise<void>
    onChanged?: (callback: () => void) => () => void
    getAccountCache?: () => Promise<string | null>
    setAccountCache?: (value: string) => Promise<void>
    clearAccountCache?: () => Promise<void>
  }
  app?: {
    getVersion?: () => Promise<string>
  }
}

type ActiveRelaySession = {
  grant: RelaySessionGrant
  renewTimer: ReturnType<typeof setTimeout> | null
}

export type RelaySessionSelection = {
  node: RelayNode
  latencyMs: number | null
  results: RelayProbeResult[]
}

let activeRelaySession: ActiveRelaySession | null = null

function desktopBridge(): DesktopBridge | undefined {
  return (globalThis as typeof globalThis & { kibotalk?: DesktopBridge }).kibotalk
}

export function isDesktopRuntime(): boolean {
  return Boolean(desktopBridge()?.auth)
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (
    typeof location !== 'undefined'
    && (location.protocol === 'http:' || location.protocol === 'https:')
  ) {
    return normalized
  }
  return `${PRODUCTION_API_ORIGIN}${normalized}`
}

export async function authorizedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = await desktopBridge()?.auth?.getAccessToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  const clientVersion = await runtimeClientVersion()
  headers.set('x-kibotalk-client-version', clientVersion)
  return fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  })
}

export async function fetchRelayNodes(): Promise<RelayNodeList> {
  const response = await authorizedFetch('/api/relay/nodes')
  const body = (await response.json().catch(() => ({}))) as Partial<RelayNodeList> & {
    error?: string
  }
  if (
    !response.ok
    || !Array.isArray(body.nodes)
    || typeof body.primaryNodeId !== 'string'
    || !body.probe
  ) throw new Error(body.error ?? `Relay nodes HTTP ${response.status}`)
  return body as RelayNodeList
}

async function requestRelayGrant(
  conversationSessionId: string,
  nodeId: string,
): Promise<RelaySessionGrant> {
  const response = await authorizedFetch('/api/relay/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversationSessionId, nodeId }),
  })
  const body = (await response.json().catch(() => ({}))) as Partial<RelaySessionGrant> & {
    error?: string
  }
  if (!response.ok || !body.token || !body.node || !body.claims) {
    throw new Error(body.error ?? `Relay session HTTP ${response.status}`)
  }
  return body as RelaySessionGrant
}

async function relayOriginFetch(
  grant: RelaySessionGrant,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${grant.token}`)
  headers.set('x-kibotalk-client-version', await runtimeClientVersion())
  return fetch(new URL(path, grant.node.origin), {
    ...init,
    credentials: 'omit',
    headers,
  })
}

async function handshakeRelay(grant: RelaySessionGrant): Promise<void> {
  const response = await relayOriginFetch(grant, '/api/relay/handshake', {
    method: 'POST',
  })
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    nodeId?: string
  }
  if (!response.ok || body.nodeId !== grant.node.id) {
    throw new Error(body.error ?? `Relay handshake HTTP ${response.status}`)
  }
}

async function confirmRelaySession(grant: RelaySessionGrant): Promise<void> {
  const response = await authorizedFetch(
    `/api/relay/sessions/${encodeURIComponent(grant.claims.conversationSessionId)}/confirm`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId: grant.node.id }),
    },
  )
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Relay confirm HTTP ${response.status}`)
  }
}

function clearRelayRenewTimer(): void {
  if (activeRelaySession?.renewTimer) clearTimeout(activeRelaySession.renewTimer)
  if (activeRelaySession) activeRelaySession.renewTimer = null
}

function scheduleRelayRenewal(): void {
  clearRelayRenewTimer()
  const current = activeRelaySession
  if (!current) return
  const renewAt =
    current.grant.claims.issuedAt * 1_000
    + current.grant.renewAfterSeconds * 1_000
  const delay = Math.max(1_000, renewAt - Date.now())
  current.renewTimer = setTimeout(() => {
    void renewRelaySession().catch(() => {
      const active = activeRelaySession
      if (!active) return
      const expiresAt = active.grant.claims.expiresAt * 1_000
      if (Date.now() >= expiresAt) return
      active.renewTimer = setTimeout(() => {
        void renewRelaySession().catch(() => {})
      }, Math.min(30_000, Math.max(1_000, expiresAt - Date.now())))
    })
  }, delay)
}

async function renewRelaySession(): Promise<void> {
  const current = activeRelaySession
  if (!current) return
  const grant = await requestRelayGrant(
    current.grant.claims.conversationSessionId,
    current.grant.node.id,
  )
  if (grant.node.id !== current.grant.node.id) {
    throw new Error('RELAY_NODE_CHANGED_DURING_SESSION')
  }
  activeRelaySession = { grant, renewTimer: null }
  scheduleRelayRenewal()
}

async function reportRelaySelection(
  conversationSessionId: string,
  selectedNodeId: string,
  results: RelayProbeResult[],
): Promise<void> {
  await authorizedFetch('/api/relay/selection-telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      conversationSessionId,
      selectedNodeId,
      results: results.map((result) => ({
        nodeId: result.node.id,
        latencyMs: result.latencyMs,
        successfulAttempts: result.successfulAttempts,
      })),
    }),
  }).catch(() => null)
}

export async function openRelaySession(options: {
  conversationSessionId: string
  nodeId: string
  probeResults?: RelayProbeResult[]
}): Promise<RelaySessionSelection> {
  const nodeList = await fetchRelayNodes()
  const selectedNode = nodeList.nodes.find((node) => node.id === options.nodeId)
  if (!selectedNode) throw new Error('SELECTED_RELAY_NODE_UNAVAILABLE')
  const results = options.probeResults ?? []
  const selectedProbe = results.find(({ node }) => node.id === selectedNode.id)
  const grant = await requestRelayGrant(
    options.conversationSessionId,
    selectedNode.id,
  )
  await handshakeRelay(grant)
  await confirmRelaySession(grant)
  clearRelayRenewTimer()
  activeRelaySession = { grant, renewTimer: null }
  scheduleRelayRenewal()
  void reportRelaySelection(
    options.conversationSessionId,
    grant.node.id,
    results,
  )
  return {
    node: grant.node,
    latencyMs: selectedProbe?.latencyMs ?? null,
    results,
  }
}

export async function relayFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const current = activeRelaySession
  if (!current) {
    if (typeof location === 'undefined' || location.hostname === 'localhost') {
      return authorizedFetch(path, init)
    }
    throw new Error('RELAY_SESSION_NOT_STARTED')
  }
  if (Date.now() >= current.grant.claims.expiresAt * 1_000) {
    await renewRelaySession()
  }
  return relayOriginFetch(activeRelaySession!.grant, path, init)
}

export async function releaseRelaySession(final: boolean): Promise<void> {
  const current = activeRelaySession
  clearRelayRenewTimer()
  activeRelaySession = null
  if (!current) return
  await releaseRelaySessionById(
    current.grant.claims.conversationSessionId,
    final,
  )
}

export async function releaseRelaySessionById(
  conversationSessionId: string,
  final: boolean,
): Promise<void> {
  await authorizedFetch(
    `/api/relay/sessions/${encodeURIComponent(conversationSessionId)}/release`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ final }),
    },
  ).catch(() => null)
}

export function currentRelayNode(): RelayNode | null {
  return activeRelaySession?.grant.node ?? null
}

export function resetRelaySessionForTests(): void {
  clearRelayRenewTimer()
  activeRelaySession = null
}

export async function saveAccessToken(token: string): Promise<void> {
  await desktopBridge()?.auth?.setAccessToken(token)
}

export async function clearAccessToken(): Promise<void> {
  await desktopBridge()?.auth?.clearAccessToken()
}

export function subscribeToAccountChanges(callback: () => void): () => void {
  return desktopBridge()?.auth?.onChanged?.(callback) ?? (() => undefined)
}

const WEB_ACCOUNT_CACHE_KEY = 'kibotalk-account-cache'

export async function readAccountCache(): Promise<string | null> {
  const getDesktopCache = desktopBridge()?.auth?.getAccountCache
  if (getDesktopCache) return getDesktopCache()
  try {
    return globalThis.localStorage?.getItem(WEB_ACCOUNT_CACHE_KEY) ?? null
  } catch {
    return null
  }
}

export async function saveAccountCache(value: string): Promise<void> {
  const setDesktopCache = desktopBridge()?.auth?.setAccountCache
  if (setDesktopCache) {
    await setDesktopCache(value)
    return
  }
  try {
    globalThis.localStorage?.setItem(WEB_ACCOUNT_CACHE_KEY, value)
  } catch {
    // An unavailable browser cache only disables offline history.
  }
}

export async function clearAccountCache(): Promise<void> {
  const clearDesktopCache = desktopBridge()?.auth?.clearAccountCache
  if (clearDesktopCache) {
    await clearDesktopCache()
    return
  }
  try {
    globalThis.localStorage?.removeItem(WEB_ACCOUNT_CACHE_KEY)
  } catch {
    // Already unavailable.
  }
}

export async function runtimeClientVersion(): Promise<string> {
  const version = await desktopBridge()?.app?.getVersion?.()
  return version ? `macos-${version}` : 'web-0.1.0'
}

export function runtimePlatform(): 'web' | 'macos' {
  return isDesktopRuntime() ? 'macos' : 'web'
}

export function runtimeDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Unknown device'
  if (isDesktopRuntime()) return navigator.userAgent.includes('Mac') ? 'Mac' : 'KiboTalk Desktop'
  return navigator.userAgent.includes('Mobile') ? '移动浏览器' : 'Web 浏览器'
}

export async function websocketApiUrl(
  path: string,
  params: URLSearchParams,
): Promise<string> {
  const response = await relayFetch('/api/relay/ws-ticket', { method: 'POST' })
  const body = (await response.json().catch(() => ({}))) as { ticket?: string; error?: string }
  if (!response.ok || !body.ticket) {
    throw new Error(body.error ?? `WS ticket HTTP ${response.status}`)
  }
  params.set('ticket', body.ticket)
  const base =
    activeRelaySession?.grant.node.origin
    ?? (
      typeof location !== 'undefined'
      && (location.protocol === 'http:' || location.protocol === 'https:')
        ? location.origin
        : PRODUCTION_API_ORIGIN
    )
  const httpUrl = new URL(path, base)
  httpUrl.search = params.toString()
  httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  return httpUrl.toString()
}

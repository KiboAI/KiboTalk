const PRODUCTION_API_ORIGIN = 'https://advx.kibotalk.app'

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
  const response = await authorizedFetch('/api/auth/ws-ticket', { method: 'POST' })
  const body = (await response.json().catch(() => ({}))) as { ticket?: string; error?: string }
  if (!response.ok || !body.ticket) {
    throw new Error(body.error ?? `WS ticket HTTP ${response.status}`)
  }
  params.set('ticket', body.ticket)
  const base =
    typeof location !== 'undefined'
    && (location.protocol === 'http:' || location.protocol === 'https:')
      ? location.origin
      : PRODUCTION_API_ORIGIN
  const httpUrl = new URL(apiUrl(path), base)
  httpUrl.search = params.toString()
  httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  return httpUrl.toString()
}

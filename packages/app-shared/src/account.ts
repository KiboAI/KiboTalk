import { useCallback, useEffect, useState } from 'react'
import {
  authorizedFetch,
  clearAccountCache,
  clearAccessToken,
  readAccountCache,
  runtimeClientVersion,
  runtimeDeviceName,
  runtimePlatform,
  saveAccountCache,
  saveAccessToken,
  subscribeToAccountChanges,
} from './api-runtime'

export type QuotaSummary = {
  freeSeconds: number
  proSeconds: number
  paidSeconds: number
  totalSeconds: number
  proUntil: string | null
  resetsAt: string
}

export type AccountSession = {
  user: {
    id: string
    email: string
    isAdmin: boolean
  }
  deviceSessionId: string
  quota: QuotaSummary
  offline?: boolean
}

export type AccountDevice = {
  id: string
  deviceName: string
  platform: string
  clientVersion: string
  createdAt: string
  lastSeenAt: string
  current: boolean
}

export async function fetchCurrentAccount(): Promise<AccountSession | null> {
  const response = await authorizedFetch('/api/auth/me')
  if (response.status === 401) return null
  const body = (await response.json().catch(() => ({}))) as AccountSession & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Account HTTP ${response.status}`)
  return body
}

function validCachedAccount(value: unknown): value is AccountSession {
  if (!value || typeof value !== 'object') return false
  const account = value as {
    user?: { id?: unknown; email?: unknown; isAdmin?: unknown }
    deviceSessionId?: unknown
    quota?: { totalSeconds?: unknown }
  }
  return (
    typeof account.user?.id === 'string'
    && typeof account.user.email === 'string'
    && typeof account.user.isAdmin === 'boolean'
    && typeof account.deviceSessionId === 'string'
    && typeof account.quota?.totalSeconds === 'number'
  )
}

async function loadCachedAccount(): Promise<AccountSession | null> {
  const raw = await readAccountCache()
  if (!raw) return null
  try {
    const account = JSON.parse(raw) as unknown
    return validCachedAccount(account) ? { ...account, offline: true } : null
  } catch {
    return null
  }
}

async function persistAccount(account: AccountSession): Promise<void> {
  await saveAccountCache(JSON.stringify({
    user: account.user,
    deviceSessionId: account.deviceSessionId,
    quota: account.quota,
  }))
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_OTP: '验证码无效或已过期。',
}

function accountError(body: { error?: string; message?: string }, fallback: string): Error {
  return new Error(body.message ?? AUTH_ERROR_MESSAGES[body.error ?? ''] ?? body.error ?? fallback)
}

export async function requestLoginCode(
  email: string,
): Promise<{ developmentCode?: string }> {
  const response = await authorizedFetch('/api/auth/request-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    message?: string
    developmentCode?: string
  }
  if (!response.ok) throw accountError(body, `OTP HTTP ${response.status}`)
  return { developmentCode: body.developmentCode }
}

export async function verifyLoginCode(
  email: string,
  code: string,
): Promise<AccountSession> {
  const response = await authorizedFetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      code,
      deviceName: runtimeDeviceName(),
      platform: runtimePlatform(),
      clientVersion: await runtimeClientVersion(),
    }),
  })
  const body = (await response.json().catch(() => ({}))) as AccountSession & {
    accessToken?: string
    error?: string
    message?: string
  }
  if (!response.ok || !body.accessToken) {
    throw accountError(body, `OTP verify HTTP ${response.status}`)
  }
  await saveAccessToken(body.accessToken)
  await persistAccount(body)
  return body
}

export async function logoutAccount(): Promise<void> {
  await authorizedFetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
  await Promise.all([clearAccessToken(), clearAccountCache()])
}

export async function deleteCloudAccount(): Promise<void> {
  const response = await authorizedFetch('/api/account', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmation: 'DELETE' }),
  })
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Delete account HTTP ${response.status}`)
  await Promise.all([clearAccessToken(), clearAccountCache()])
}

export async function redeemCode(code: string): Promise<AccountSession['quota']> {
  const response = await authorizedFetch('/api/account/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    quota?: AccountSession['quota']
    error?: string
  }
  if (!response.ok || !body.quota) {
    throw new Error(body.error ?? `Redeem HTTP ${response.status}`)
  }
  return body.quota
}

export async function fetchAccountDevices(): Promise<AccountDevice[]> {
  const response = await authorizedFetch('/api/auth/devices')
  const body = (await response.json().catch(() => ({}))) as {
    devices?: AccountDevice[]
    error?: string
  }
  if (!response.ok) throw new Error(body.error ?? `Devices HTTP ${response.status}`)
  return body.devices ?? []
}

export async function revokeAccountDevice(deviceId: string): Promise<boolean> {
  const response = await authorizedFetch(`/api/auth/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
  })
  const body = (await response.json().catch(() => ({}))) as {
    currentDeviceRevoked?: boolean
    error?: string
  }
  if (!response.ok) throw new Error(body.error ?? `Revoke device HTTP ${response.status}`)
  if (body.currentDeviceRevoked) {
    await Promise.all([clearAccessToken(), clearAccountCache()])
  }
  return Boolean(body.currentDeviceRevoked)
}

export function useAccount() {
  const [account, setAccountState] = useState<AccountSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await fetchCurrentAccount()
      setAccountState(next)
      if (next) await persistAccount(next)
      else await Promise.all([clearAccessToken(), clearAccountCache()])
      return next
    } catch (cause) {
      const cached = await loadCachedAccount()
      setError(cause instanceof Error ? cause.message : String(cause))
      setAccountState(cached)
      return cached
    } finally {
      setLoading(false)
    }
  }, [])

  const setAccount = useCallback((next: AccountSession | null) => {
    setAccountState(next)
    if (next) void persistAccount(next)
    else void clearAccountCache()
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const handleQuotaChanged = () => void refresh()
    globalThis.addEventListener?.('kibotalk:quota-changed', handleQuotaChanged)
    return () => globalThis.removeEventListener?.('kibotalk:quota-changed', handleQuotaChanged)
  }, [refresh])

  useEffect(() => subscribeToAccountChanges(() => void refresh()), [refresh])

  return { account, setAccount, loading, error, refresh }
}

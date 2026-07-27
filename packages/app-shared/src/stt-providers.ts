import { authorizedFetch } from './api-runtime'

export type SttProvider = {
  id: string
  label: string
  model: string
  active: boolean
  mode: 'realtime'
}

export function defaultSttProvider(providers: SttProvider[]): string | null {
  return providers.find((p) => p.active)?.id ?? providers[0]?.id ?? null
}

/** Fetch realtime STT providers configured server-side. */
export async function fetchSttProviders(): Promise<SttProvider[]> {
  const res = await authorizedFetch('/api/stt/providers')
  if (!res.ok) return []
  const data = (await res.json().catch(() => ({}))) as { providers?: SttProvider[] }
  return data.providers ?? []
}

/** Prefer an active realtime provider; fall back to any configured one. */
export function defaultRealtimeFirstProvider(providers: SttProvider[]): string | null {
  return (
    providers.find((p) => p.active)?.id
    ?? providers[0]?.id
    ?? null
  )
}

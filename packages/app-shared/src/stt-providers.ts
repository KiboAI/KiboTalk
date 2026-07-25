import { authorizedFetch } from './api-runtime'

export type SttProvider = {
  id: string
  label: string
  model: string
  active: boolean
  mode?: 'batch' | 'realtime'
}

export function sttUrl(
  provider: string | null,
  language?: string | null,
): string {
  const params = new URLSearchParams()
  if (provider) params.set('provider', provider)
  if (language) params.set('language', language)
  const qs = params.toString()
  return qs ? `/api/stt?${qs}` : '/api/stt'
}

export function defaultSttProvider(providers: SttProvider[]): string | null {
  return providers.find((p) => p.active)?.id ?? providers[0]?.id ?? null
}

export function providerMode(
  providers: SttProvider[],
  id: string | null,
): 'batch' | 'realtime' {
  if (!id) return 'batch'
  return providers.find((p) => p.id === id)?.mode ?? 'batch'
}

/** Fetch the STT providers the `/stt` proxy has configured server-side. */
export async function fetchSttProviders(): Promise<SttProvider[]> {
  const res = await authorizedFetch('/api/stt/providers')
  if (!res.ok) return []
  const data = (await res.json().catch(() => ({}))) as { providers?: SttProvider[] }
  return data.providers ?? []
}

/** Prefer a `realtime` provider (product default transport); fall back to any active one. */
export function defaultRealtimeFirstProvider(providers: SttProvider[]): string | null {
  return (
    providers.find((p) => p.mode === 'realtime' && p.active)?.id
    ?? providers.find((p) => p.mode === 'realtime')?.id
    ?? defaultSttProvider(providers)
  )
}

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
  return qs ? `/stt?${qs}` : '/stt'
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

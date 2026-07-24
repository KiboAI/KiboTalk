import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kibotalk/ui'
import { useEffect, useState } from 'react'
import { useConfig } from './config-store'
import type { SttProvider } from './stt-providers'
import { defaultSttProvider, providerMode, sttUrl } from './stt-providers'

export type { SttProvider }
export { defaultSttProvider, providerMode, sttUrl }

export function useSttProviders(): SttProvider[] {
  const [providers, setProviders] = useState<SttProvider[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/stt/providers')
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d: { providers?: SttProvider[] }) => {
        if (!cancelled) setProviders(d.providers ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return providers
}

export function useTranscribeProvider(): { providers: SttProvider[]; provider: string | null } {
  const providers = useSttProviders()
  const provider = useConfig((s) => s.transcribeProvider)
  const bootstrap = useConfig((s) => s.bootstrapProvider)
  useEffect(() => {
    bootstrap(providers)
  }, [providers, bootstrap])
  return { providers, provider }
}

type SttProviderSelectProps = {
  providers: SttProvider[]
  value: string | null
  onChange: (provider: string | null) => void
  allowOff?: boolean
  offLabel?: string
  disabled?: boolean
  id?: string
}

/** Shared STT provider selector (shadcn Select). */
export function SttProviderSelect({
  providers,
  value,
  onChange,
  allowOff = true,
  offLabel = '关闭',
  disabled,
  id,
}: SttProviderSelectProps) {
  const selectValue = value ?? (allowOff ? '__off__' : '')
  return (
    <div className="w-full space-y-1.5">
      <Select
        value={selectValue || undefined}
        onValueChange={(v) => onChange(v === '__off__' ? null : v)}
        disabled={disabled || providers.length === 0}
      >
        <SelectTrigger id={id} className="h-9 w-full">
          <SelectValue placeholder={providers.length === 0 ? '无可用 provider' : '选择'} />
        </SelectTrigger>
        <SelectContent>
          {allowOff ? <SelectItem value="__off__">{offLabel}</SelectItem> : null}
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
              {p.mode === 'realtime' ? ' · 实时' : ' · batch'}
              {p.active ? ' · 默认' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {providers.length === 0 ? (
        <p className="text-xs text-muted-foreground">服务端未配置 STT provider</p>
      ) : null}
    </div>
  )
}

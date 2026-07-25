import type { RequestAuth } from './auth'
import { databaseConfigured, getDatabase } from './db'

export type TelemetryEvent = {
  requestId?: string
  eventType: string
  provider?: string
  model?: string
  status: 'started' | 'ok' | 'error' | 'cancelled' | 'rejected'
  durationMs?: number
  billedAudioSeconds?: number
  inputTokens?: number
  outputTokens?: number
  errorCode?: string
  metadata?: Record<string, string | number | boolean | null>
}

/** Privacy boundary: this type intentionally has no text/audio/content fields. */
export async function recordTelemetry(
  auth: RequestAuth | null,
  event: TelemetryEvent,
): Promise<void> {
  if (!databaseConfigured() || process.env.NODE_ENV === 'test') return
  const sql = getDatabase()
  await sql`
    INSERT INTO telemetry_events (
      user_id,
      device_session_id,
      request_id,
      event_type,
      provider,
      model,
      status,
      duration_ms,
      billed_audio_seconds,
      input_tokens,
      output_tokens,
      error_code,
      platform,
      client_version,
      metadata
    )
    VALUES (
      ${auth?.userId ?? null},
      ${auth?.deviceSessionId ?? null},
      ${event.requestId ?? null},
      ${event.eventType},
      ${event.provider ?? null},
      ${event.model ?? null},
      ${event.status},
      ${event.durationMs ?? null},
      ${event.billedAudioSeconds ?? null},
      ${event.inputTokens ?? null},
      ${event.outputTokens ?? null},
      ${event.errorCode ?? null},
      ${auth?.platform ?? null},
      ${auth?.clientVersion ?? null},
      ${sql.json(event.metadata ?? {})}
    )
  `
}

export function recordTelemetryLater(
  auth: RequestAuth | null,
  event: TelemetryEvent,
): void {
  void recordTelemetry(auth, event).catch(() => {})
}


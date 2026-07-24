import type { IOSubsystem } from '@kibotalk/observability'
import { IOSubsystems } from '@kibotalk/observability'

export interface SubsystemConfig {
  subsystem: IOSubsystem
  label: string
  color: string
  bgColor: string
}

export const SUBSYSTEM_CONFIGS: SubsystemConfig[] = [
  { subsystem: IOSubsystems.VAD, label: 'VAD', color: '#3b82f6', bgColor: '#3b82f618' },
  { subsystem: IOSubsystems.SpeakerVerify, label: 'Speaker', color: '#14b8a6', bgColor: '#14b8a618' },
  { subsystem: IOSubsystems.STT, label: 'STT', color: '#a855f7', bgColor: '#a855f718' },
  { subsystem: IOSubsystems.Aggregator, label: 'Aggregator', color: '#f59e0b', bgColor: '#f59e0b18' },
  { subsystem: IOSubsystems.LLM, label: 'LLM', color: '#22c55e', bgColor: '#22c55e18' },
]

export const SUBSYSTEM_CONFIG_MAP = new Map(SUBSYSTEM_CONFIGS.map((c) => [c.subsystem, c]))

/** Height of one span row in pixels */
export const ROW_HEIGHT = 28
/** Vertical padding inside each row for the span bar */
export const ROW_PADDING = 4
/** Width of the left label column */
export const LABEL_COL_WIDTH = 140
/** Height of the time axis ruler */
export const TIME_AXIS_HEIGHT = 28
/** Height of the minimap */
export const MINIMAP_HEIGHT = 32
/** Gap detection threshold: gaps longer than this (ms) are highlighted */
export const GAP_WARN_THRESHOLD_MS = 100

export function fmtMs(ms: number): string {
  if (ms < 0.01) return '0ms'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

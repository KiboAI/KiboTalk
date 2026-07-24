import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

export type WindowBounds = { x: number; y: number; width: number; height: number }

export type AppConfig = {
  onboardingCompleted: boolean
  islandBoundsByDisplay: Record<string, WindowBounds>
  islandContentSide: 'above' | 'below'
}

const defaultConfig: AppConfig = {
  onboardingCompleted: false,
  islandBoundsByDisplay: {},
  islandContentSide: 'above',
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

/** Small persisted JSON blob (island window bounds, onboarding-completed flag) — no schema library needed for two fields. */
export function readConfig(): AppConfig {
  try {
    const raw = readFileSync(configPath(), 'utf-8')
    return { ...defaultConfig, ...(JSON.parse(raw) as Partial<AppConfig>) }
  } catch {
    return { ...defaultConfig }
  }
}

export function writeConfig(config: AppConfig): void {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8')
}

export function updateConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...readConfig(), ...patch }
  writeConfig(next)
  return next
}

/**
 * IPC channel names + payload/result types shared by main, preload, and
 * renderer. Plain `ipcMain.handle` / `contextBridge` — no eventa dependency
 * (see the desktop plan's Phase D notes: not worth it for this handful of
 * channels).
 */

/** Mirrors Electron's `systemPreferences.getMediaAccessStatus` return type without importing `electron` into renderer-reachable code. */
export type MediaAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

export const IPC_CHANNEL = {
  onboardingGetStatus: 'onboarding:get-status',
  onboardingOpen: 'onboarding:open',
  onboardingComplete: 'onboarding:complete',
  onboardingCompletedEvent: 'onboarding:completed',
  onboardingResize: 'onboarding:resize',
  onboardingClose: 'onboarding:close',
  permissionsCheckMicrophone: 'permissions:check-microphone',
  permissionsRequestMicrophone: 'permissions:request-microphone',
  permissionsCheckScreenRecording: 'permissions:check-screen-recording',
  permissionsRequestScreenRecording: 'permissions:request-screen-recording',
  systemAudioStart: 'system-audio:start',
  systemAudioStop: 'system-audio:stop',
} as const

export type OnboardingStatus = { completed: boolean }

/** Renderer-measured content box — main process applies it via `setContentSize`. */
export type OnboardingContentSize = { width: number; height: number }

export type SystemAudioStartResult = { ok: true } | { ok: false; error: string }

/** The API surface `preload` exposes on `window.kibotalk`. */
export type KiboTalkDesktopApi = {
  onboarding: {
    getStatus: () => Promise<OnboardingStatus>
    open: () => Promise<void>
    complete: () => Promise<void>
    resize: (size: OnboardingContentSize) => Promise<void>
    close: () => Promise<void>
    onCompleted: (callback: () => void) => () => void
  }
  permissions: {
    checkMicrophone: () => Promise<MediaAccessStatus>
    requestMicrophone: () => Promise<boolean>
    checkScreenRecording: () => Promise<MediaAccessStatus>
    requestScreenRecording: () => Promise<void>
  }
  systemAudio: {
    start: () => Promise<SystemAudioStartResult>
    stop: () => Promise<void>
  }
}

declare global {
  interface Window {
    kibotalk: KiboTalkDesktopApi
  }
}

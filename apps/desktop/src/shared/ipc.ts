/**
 * IPC channel names + payload/result types shared by main, preload, and
 * renderer. Plain `ipcMain.handle` / `contextBridge` — no eventa dependency
 * (see the desktop plan's Phase D notes: not worth it for this handful of
 * channels).
 */

/** Mirrors Electron's `systemPreferences.getMediaAccessStatus` return type without importing `electron` into renderer-reachable code. */
export type MediaAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
export type ProductWindowView = 'settings' | 'history' | 'voiceprint' | 'account'
export type IslandContentSide = 'above' | 'below'
export type DesktopSessionLifecycle = 'restoring' | 'stopped' | 'starting' | 'running' | 'paused'
export type DesktopSessionCommand =
  | 'start'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'toggle-ai'
  | 'open-history'
  | 'open-settings'
  | 'prepare-quit'

export type DesktopSessionState = {
  lifecycle: DesktopSessionLifecycle
  replyEnabled: boolean
  uiLang: 'zh' | 'ja' | 'en'
}

export const IPC_CHANNEL = {
  onboardingGetStatus: 'onboarding:get-status',
  onboardingOpen: 'onboarding:open',
  onboardingComplete: 'onboarding:complete',
  onboardingCompletedEvent: 'onboarding:completed',
  onboardingReset: 'onboarding:reset',
  onboardingResetEvent: 'onboarding:reset-completed',
  onboardingResize: 'onboarding:resize',
  onboardingClose: 'onboarding:close',
  onboardingViewRequestedEvent: 'onboarding:view-requested',
  permissionsCheckMicrophone: 'permissions:check-microphone',
  permissionsRequestMicrophone: 'permissions:request-microphone',
  permissionsCheckScreenRecording: 'permissions:check-screen-recording',
  permissionsRequestScreenRecording: 'permissions:request-screen-recording',
  systemAudioStart: 'system-audio:start',
  systemAudioStop: 'system-audio:stop',
  islandGetContentSide: 'island:get-content-side',
  islandContentSideChanged: 'island:content-side-changed',
  islandHide: 'island:hide',
  islandShow: 'island:show',
  islandSetPointerThrough: 'island:set-pointer-through',
  sessionUpdateState: 'session:update-state',
  sessionCommandEvent: 'session:command',
  appSetLaunchAtLogin: 'app:set-launch-at-login',
  appRequestQuit: 'app:request-quit',
  appQuitReady: 'app:quit-ready',
  appGetVersion: 'app:get-version',
  authGetAccessToken: 'auth:get-access-token',
  authSetAccessToken: 'auth:set-access-token',
  authClearAccessToken: 'auth:clear-access-token',
  authGetAccountCache: 'auth:get-account-cache',
  authSetAccountCache: 'auth:set-account-cache',
  authClearAccountCache: 'auth:clear-account-cache',
} as const

export type OnboardingStatus = { completed: boolean; view: ProductWindowView }

/** Renderer-measured content box — main process applies it via `setContentSize`. */
export type OnboardingContentSize = { width: number; height: number }

export type SystemAudioStartResult = { ok: true } | { ok: false; error: string }

/** The API surface `preload` exposes on `window.kibotalk`. */
export type KiboTalkDesktopApi = {
  onboarding: {
    getStatus: () => Promise<OnboardingStatus>
    open: (view?: ProductWindowView) => Promise<void>
    complete: () => Promise<void>
    reset: () => Promise<void>
    resize: (size: OnboardingContentSize) => Promise<void>
    close: () => Promise<void>
    onCompleted: (callback: () => void) => () => void
    onReset: (callback: () => void) => () => void
    onViewRequested: (callback: (view: ProductWindowView) => void) => () => void
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
  island: {
    getContentSide: () => Promise<IslandContentSide>
    hide: () => Promise<void>
    show: () => Promise<void>
    setPointerThrough: (ignored: boolean) => Promise<void>
    onContentSideChanged: (callback: (side: IslandContentSide) => void) => () => void
  }
  session: {
    updateState: (state: DesktopSessionState) => Promise<void>
    onCommand: (callback: (command: DesktopSessionCommand) => void) => () => void
  }
  app: {
    getVersion: () => Promise<string>
    setLaunchAtLogin: (enabled: boolean) => Promise<void>
    requestQuit: () => Promise<void>
    quitReady: () => Promise<void>
  }
  auth: {
    getAccessToken: () => Promise<string | null>
    setAccessToken: (token: string) => Promise<void>
    clearAccessToken: () => Promise<void>
    getAccountCache: () => Promise<string | null>
    setAccountCache: (value: string) => Promise<void>
    clearAccountCache: () => Promise<void>
  }
}

declare global {
  interface Window {
    kibotalk: KiboTalkDesktopApi
  }
}

import type { BrowserWindow } from 'electron'
import { app, ipcMain } from 'electron'
import {
  IPC_CHANNEL,
  type DesktopSessionState,
  type OnboardingContentSize,
  type ProductWindowView,
} from '../shared/ipc'
import { readConfig, updateConfig } from './config'
import {
  checkMicrophonePermission,
  checkScreenRecordingPermission,
  requestMicrophonePermission,
  requestScreenRecordingPermission,
} from './permissions'
import { startSystemAudioCapture, stopSystemAudioCapture } from './system-audio'
import {
  clearAccessToken,
  clearAccountCache,
  readAccessToken,
  readAccountCache,
  writeAccessToken,
  writeAccountCache,
} from './auth-token'
import {
  closeOnboardingWindow,
  getRequestedProductView,
  openOnboardingWindow,
  resizeOnboardingWindow,
} from './windows/onboarding'

/** Registers every `ipcMain.handle` channel the preload bridge exposes as `window.kibotalk`. */
export function registerIpcHandlers(params: {
  getIslandWindow: () => BrowserWindow | null
  onSessionState: (state: DesktopSessionState) => void
  requestQuit: () => Promise<void>
  quitReady: () => void
}): void {
  ipcMain.handle(IPC_CHANNEL.onboardingGetStatus, () => ({
    completed: readConfig().onboardingCompleted,
    view: getRequestedProductView(),
  }))

  ipcMain.handle(IPC_CHANNEL.onboardingOpen, async (_event, view?: ProductWindowView) => {
    await openOnboardingWindow(view)
  })

  ipcMain.handle(IPC_CHANNEL.onboardingComplete, () => {
    updateConfig({ onboardingCompleted: true })
    if (process.platform === 'darwin') app.dock?.hide()
    params.getIslandWindow()?.webContents.send(IPC_CHANNEL.onboardingCompletedEvent)
    closeOnboardingWindow()
  })

  ipcMain.handle(IPC_CHANNEL.onboardingReset, () => {
    updateConfig({ onboardingCompleted: false })
    if (process.platform === 'darwin') app.dock?.show()
    params.getIslandWindow()?.webContents.send(IPC_CHANNEL.onboardingResetEvent)
  })

  ipcMain.handle(IPC_CHANNEL.onboardingResize, (_event, size: OnboardingContentSize) => {
    resizeOnboardingWindow(size)
  })

  ipcMain.handle(IPC_CHANNEL.onboardingClose, () => {
    closeOnboardingWindow()
  })

  ipcMain.handle(IPC_CHANNEL.permissionsCheckMicrophone, () => checkMicrophonePermission())
  ipcMain.handle(IPC_CHANNEL.permissionsRequestMicrophone, () => requestMicrophonePermission())
  ipcMain.handle(IPC_CHANNEL.permissionsCheckScreenRecording, () => checkScreenRecordingPermission())
  ipcMain.handle(IPC_CHANNEL.permissionsRequestScreenRecording, () => requestScreenRecordingPermission())

  ipcMain.handle(IPC_CHANNEL.systemAudioStart, () => startSystemAudioCapture())
  ipcMain.handle(IPC_CHANNEL.systemAudioStop, () => stopSystemAudioCapture())

  ipcMain.handle(IPC_CHANNEL.islandGetContentSide, () => readConfig().islandContentSide)
  ipcMain.handle(IPC_CHANNEL.islandHide, () => params.getIslandWindow()?.hide())
  ipcMain.handle(IPC_CHANNEL.islandShow, () => {
    params.getIslandWindow()?.show()
    params.getIslandWindow()?.focus()
  })
  ipcMain.handle(IPC_CHANNEL.islandSetPointerThrough, (_event, ignored: boolean) => {
    params.getIslandWindow()?.setIgnoreMouseEvents(ignored, { forward: true })
  })

  ipcMain.handle(IPC_CHANNEL.sessionUpdateState, (_event, state: DesktopSessionState) => {
    params.onSessionState(state)
  })

  ipcMain.handle(IPC_CHANNEL.appSetLaunchAtLogin, (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
  })
  ipcMain.handle(IPC_CHANNEL.appRequestQuit, () => params.requestQuit())
  ipcMain.handle(IPC_CHANNEL.appQuitReady, () => params.quitReady())
  ipcMain.handle(IPC_CHANNEL.appGetVersion, () => app.getVersion())
  ipcMain.handle(IPC_CHANNEL.authGetAccessToken, () => readAccessToken())
  ipcMain.handle(IPC_CHANNEL.authSetAccessToken, (_event, token: string) => {
    if (!token || token.length > 4096) throw new Error('Invalid access token')
    writeAccessToken(token)
  })
  ipcMain.handle(IPC_CHANNEL.authClearAccessToken, () => clearAccessToken())
  ipcMain.handle(IPC_CHANNEL.authGetAccountCache, () => readAccountCache())
  ipcMain.handle(IPC_CHANNEL.authSetAccountCache, (_event, value: string) => {
    if (!value || value.length > 16_384) throw new Error('Invalid account cache')
    writeAccountCache(value)
  })
  ipcMain.handle(IPC_CHANNEL.authClearAccountCache, () => clearAccountCache())
}

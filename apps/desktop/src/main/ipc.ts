import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { IPC_CHANNEL, type OnboardingContentSize } from '../shared/ipc'
import { readConfig, updateConfig } from './config'
import {
  checkMicrophonePermission,
  checkScreenRecordingPermission,
  requestMicrophonePermission,
  requestScreenRecordingPermission,
} from './permissions'
import { startSystemAudioCapture, stopSystemAudioCapture } from './system-audio'
import { closeOnboardingWindow, openOnboardingWindow, resizeOnboardingWindow } from './windows/onboarding'

/** Registers every `ipcMain.handle` channel the preload bridge exposes as `window.kibotalk`. */
export function registerIpcHandlers(params: { getIslandWindow: () => BrowserWindow | null }): void {
  ipcMain.handle(IPC_CHANNEL.onboardingGetStatus, () => ({ completed: readConfig().onboardingCompleted }))

  ipcMain.handle(IPC_CHANNEL.onboardingOpen, async () => {
    await openOnboardingWindow()
  })

  ipcMain.handle(IPC_CHANNEL.onboardingComplete, () => {
    updateConfig({ onboardingCompleted: true })
    params.getIslandWindow()?.webContents.send(IPC_CHANNEL.onboardingCompletedEvent)
    closeOnboardingWindow()
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
}

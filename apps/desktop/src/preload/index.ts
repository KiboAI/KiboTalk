import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNEL } from '../shared/ipc'
import type { KiboTalkDesktopApi } from '../shared/ipc'

const api: KiboTalkDesktopApi = {
  onboarding: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNEL.onboardingGetStatus),
    open: () => ipcRenderer.invoke(IPC_CHANNEL.onboardingOpen),
    complete: () => ipcRenderer.invoke(IPC_CHANNEL.onboardingComplete),
    resize: (size) => ipcRenderer.invoke(IPC_CHANNEL.onboardingResize, size),
    close: () => ipcRenderer.invoke(IPC_CHANNEL.onboardingClose),
    onCompleted: (callback) => {
      const listener = () => callback()
      ipcRenderer.on(IPC_CHANNEL.onboardingCompletedEvent, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNEL.onboardingCompletedEvent, listener)
    },
  },
  permissions: {
    checkMicrophone: () => ipcRenderer.invoke(IPC_CHANNEL.permissionsCheckMicrophone),
    requestMicrophone: () => ipcRenderer.invoke(IPC_CHANNEL.permissionsRequestMicrophone),
    checkScreenRecording: () => ipcRenderer.invoke(IPC_CHANNEL.permissionsCheckScreenRecording),
    requestScreenRecording: () => ipcRenderer.invoke(IPC_CHANNEL.permissionsRequestScreenRecording),
  },
  systemAudio: {
    start: () => ipcRenderer.invoke(IPC_CHANNEL.systemAudioStart),
    stop: () => ipcRenderer.invoke(IPC_CHANNEL.systemAudioStop),
  },
}

contextBridge.exposeInMainWorld('kibotalk', api)

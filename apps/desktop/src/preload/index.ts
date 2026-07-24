import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNEL } from '../shared/ipc'
import type { KiboTalkDesktopApi } from '../shared/ipc'

const api: KiboTalkDesktopApi = {
  onboarding: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNEL.onboardingGetStatus),
    open: (view) => ipcRenderer.invoke(IPC_CHANNEL.onboardingOpen, view),
    complete: () => ipcRenderer.invoke(IPC_CHANNEL.onboardingComplete),
    reset: () => ipcRenderer.invoke(IPC_CHANNEL.onboardingReset),
    resize: (size) => ipcRenderer.invoke(IPC_CHANNEL.onboardingResize, size),
    close: () => ipcRenderer.invoke(IPC_CHANNEL.onboardingClose),
    onCompleted: (callback) => {
      const listener = () => callback()
      ipcRenderer.on(IPC_CHANNEL.onboardingCompletedEvent, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNEL.onboardingCompletedEvent, listener)
    },
    onReset: (callback) => {
      const listener = () => callback()
      ipcRenderer.on(IPC_CHANNEL.onboardingResetEvent, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNEL.onboardingResetEvent, listener)
    },
    onViewRequested: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, view: Parameters<typeof callback>[0]) => callback(view)
      ipcRenderer.on(IPC_CHANNEL.onboardingViewRequestedEvent, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNEL.onboardingViewRequestedEvent, listener)
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
  island: {
    getContentSide: () => ipcRenderer.invoke(IPC_CHANNEL.islandGetContentSide),
    hide: () => ipcRenderer.invoke(IPC_CHANNEL.islandHide),
    show: () => ipcRenderer.invoke(IPC_CHANNEL.islandShow),
    setPointerThrough: (ignored) => ipcRenderer.invoke(IPC_CHANNEL.islandSetPointerThrough, ignored),
    onContentSideChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, side: Parameters<typeof callback>[0]) => callback(side)
      ipcRenderer.on(IPC_CHANNEL.islandContentSideChanged, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNEL.islandContentSideChanged, listener)
    },
  },
  session: {
    updateState: (state) => ipcRenderer.invoke(IPC_CHANNEL.sessionUpdateState, state),
    onCommand: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, command: Parameters<typeof callback>[0]) => callback(command)
      ipcRenderer.on(IPC_CHANNEL.sessionCommandEvent, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNEL.sessionCommandEvent, listener)
    },
  },
  app: {
    setLaunchAtLogin: (enabled) => ipcRenderer.invoke(IPC_CHANNEL.appSetLaunchAtLogin, enabled),
    requestQuit: () => ipcRenderer.invoke(IPC_CHANNEL.appRequestQuit),
    quitReady: () => ipcRenderer.invoke(IPC_CHANNEL.appQuitReady),
  },
}

contextBridge.exposeInMainWorld('kibotalk', api)

import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { readConfig } from './config'
import { registerModelProtocolHandler, registerModelProtocolScheme } from './model-protocol'
import { createIslandWindow } from './windows/island'
import { openOnboardingWindow } from './windows/onboarding'

let islandWindow: BrowserWindow | null = null

registerModelProtocolScheme()

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.kibotalk.desktop')
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))

  registerModelProtocolHandler()
  registerIpcHandlers({ getIslandWindow: () => islandWindow })

  islandWindow = await createIslandWindow()

  if (!readConfig().onboardingCompleted) {
    await openOnboardingWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createIslandWindow().then((window) => {
        islandWindow = window
      })
    } else {
      islandWindow?.show()
    }
  })
})

// Mac apps stay in the Dock/menu bar after the Island is closed; quitting is explicit (Cmd+Q).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

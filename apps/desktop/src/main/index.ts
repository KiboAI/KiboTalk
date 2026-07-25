import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { readConfig } from './config'
import { registerModelProtocolHandler, registerModelProtocolScheme } from './model-protocol'
import { createTrayController } from './tray'
import { createIslandWindow } from './windows/island'
import { openOnboardingWindow } from './windows/onboarding'
import { checkForManualUpdate } from './update-check'

let islandWindow: BrowserWindow | null = null
let trayController: ReturnType<typeof createTrayController> | null = null
let quitConfirmed = false

function finishQuit() {
  quitConfirmed = true
  trayController?.destroy()
  app.quit()
}

registerModelProtocolScheme()

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.kibotalk.desktop')
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))

  registerModelProtocolHandler()
  registerIpcHandlers({
    getIslandWindow: () => islandWindow,
    onSessionState: (state) => trayController?.updateState(state),
    requestQuit: async () => trayController?.requestQuit(),
    quitReady: finishQuit,
  })

  islandWindow = await createIslandWindow()

  trayController = createTrayController({
    getIslandWindow: () => islandWindow,
    onQuitConfirmed: finishQuit,
  })
  islandWindow.on('show', trayController.refresh)
  islandWindow.on('hide', trayController.refresh)

  if (!readConfig().onboardingCompleted) {
    app.dock?.show()
    await openOnboardingWindow()
  } else {
    app.dock?.hide()
  }
  setTimeout(() => void checkForManualUpdate(), 10_000)

  app.on('activate', () => {
    if (!islandWindow || islandWindow.isDestroyed()) {
      void createIslandWindow().then((window) => {
        islandWindow = window
      })
    } else {
      islandWindow.show()
      islandWindow.focus()
    }
  })
})

app.on('before-quit', (event) => {
  if (quitConfirmed) return
  event.preventDefault()
  void trayController?.requestQuit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

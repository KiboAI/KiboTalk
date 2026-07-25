import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, TooltipProvider } from '@kibotalk/ui'
import { configureModelSource, useHuggingFaceModels } from '@kibotalk/app-shared'
import App from './App'
import AdminApp from './AdminApp'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')
if (import.meta.env.PROD) {
  useHuggingFaceModels(window.location.origin)
  configureModelSource({
    bundled: false,
    fallbackOrigin: window.location.origin,
  })
}
const RootApp = window.location.pathname.startsWith('/admin') ? AdminApp : App

createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={280}>
      <RootApp />
      <Toaster richColors position="bottom-right" />
    </TooltipProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js')
  })
}

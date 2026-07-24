import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, TooltipProvider } from '@kibotalk/ui'
import App from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')
createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={280}>
      <App />
      <Toaster richColors position="bottom-right" />
    </TooltipProvider>
  </StrictMode>,
)

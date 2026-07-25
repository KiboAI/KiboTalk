import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@kibotalk/ui'
import { LandingPage } from './LandingPage'
import { localeFromPath } from './copy'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

const locale = localeFromPath(window.location.pathname)
window.localStorage.setItem('kibotalk-landing-language', locale)

createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={280}>
      <LandingPage locale={locale} />
    </TooltipProvider>
  </StrictMode>,
)

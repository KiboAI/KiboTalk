import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureModelSource, useBundledModels } from '@kibotalk/app-shared'
import { Toaster, TooltipProvider } from '@kibotalk/ui'
import OnboardingApp from './OnboardingApp'
import './onboarding.css'

// See main.tsx — same bundled-models switch, needed here too since
// enrollment's speaker-embedding model loads from this window.
if (import.meta.env.PROD) {
  useBundledModels()
  configureModelSource({ bundled: true })
}

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')
createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={280}>
      <OnboardingApp />
      <Toaster richColors position="bottom-right" />
    </TooltipProvider>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureModelSource, useBundledModels } from '@kibotalk/app-shared'
import { TooltipProvider } from '@kibotalk/ui'
import IslandApp from './IslandApp'
import './index.css'

// Dev server keeps fetching models from the real Hub (matches `pnpm dev:desktop`'s
// existing behavior); only a packaged/built app has `resources/models` to serve —
// see `apps/desktop/scripts/download-models.ts` + `src/main/model-protocol.ts`.
if (import.meta.env.PROD) {
  useBundledModels()
  configureModelSource({ bundled: true })
}

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')
createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={280}>
      <IslandApp />
    </TooltipProvider>
  </StrictMode>,
)

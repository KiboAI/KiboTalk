import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { DesktopProductWindowFrame } from './DesktopProductWindowFrame'

export type WizardScreenProps = {
  children: ReactNode
  /**
   * Desktop's onboarding window is a separate frameless window with its own
   * custom drag strip — the page should fill it edge-to-edge instead of
   * floating a bordered/shadowed card inside another window's chrome (native
   * title bar + this card's own border/shadow reads as a double frame).
   * `apps/web` renders the same pages in a normal browser tab with no window
   * chrome of its own, so it keeps the centered floating-card look (the
   * default, `embedded` unset).
   */
  embedded?: boolean
  className?: string
}

/**
 * Shared outer chrome for the onboarding / enrollment wizard pages — owns the
 * "floating card on a page" vs "edge-to-edge inside a frameless window"
 * decision so individual pages only render their content.
 */
export function WizardScreen({ children, embedded, className }: WizardScreenProps) {
  if (embedded) {
    // No min-h-screen: desktop sizes the BrowserWindow to this root's height
    // (see apps/desktop OnboardingApp + onboarding:resize). Filling the viewport
    // would make content height circularly equal the (too-tall) window.
    return (
      <DesktopProductWindowFrame heightMode="content">
        <div className="flex items-start justify-center px-6 pb-10">
          <div className={cn('w-full max-w-md', className)}>{children}</div>
        </div>
      </DesktopProductWindowFrame>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className={cn('paper-sheet w-full max-w-md', className)}>{children}</div>
    </div>
  )
}

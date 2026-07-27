import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { DesktopWindowHeader } from './DesktopWindowHeader'

export type DesktopProductWindowFrameProps = {
  children: ReactNode
  heightMode: 'content' | 'viewport'
}

/**
 * Shared renderer chrome for opaque desktop product windows.
 * Transparent Island windows intentionally use their own shell.
 */
export function DesktopProductWindowFrame({
  children,
  heightMode,
}: DesktopProductWindowFrameProps) {
  const viewport = heightMode === 'viewport'
  return (
    <div
      data-desktop-product-window-frame
      className={cn(
        'flex w-full flex-col bg-background',
        viewport && 'h-dvh overflow-hidden',
      )}
    >
      <DesktopWindowHeader />
      <div
        data-desktop-product-window-content
        className={cn('w-full', viewport && 'flex min-h-0 flex-1 overflow-hidden')}
      >
        {children}
      </div>
    </div>
  )
}

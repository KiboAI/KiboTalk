import * as React from 'react'
import type { ReactNode, Ref } from 'react'

export type IslandShellProps = {
  contentSide: 'above' | 'below'
  content: ReactNode
  island: ReactNode
  rootRef?: Ref<HTMLDivElement>
}

export function IslandShell({
  contentSide,
  content,
  island,
  rootRef,
}: IslandShellProps) {
  const contentSlot = (
    <div
      className="flex min-h-0 w-full flex-1"
      data-island-content-slot
    >
      {content}
    </div>
  )

  return (
    <div
      ref={rootRef}
      className="island-window-shell h-dvh w-full p-2"
      data-island-content-side={contentSide}
      data-island-menu-side={contentSide === 'above' ? 'top' : 'bottom'}
    >
      <div className="flex h-full w-full flex-col gap-2.5">
        {contentSide === 'above' ? contentSlot : island}
        {contentSide === 'above' ? island : contentSlot}
      </div>
    </div>
  )
}

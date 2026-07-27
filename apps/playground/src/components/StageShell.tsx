import { useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@kibotalk/ui'
import {
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  SlidersHorizontal,
} from 'lucide-react'
import { useConfig } from '../config-store'

export type StageShellProps = {
  /** Large center window — what end users would see. */
  stage: ReactNode
  /** Right rail — lab / debug. */
  debug: ReactNode
  debugTitle?: string
  /** Optional left rail (e.g. transcript). */
  left?: ReactNode
  leftTitle?: string
  defaultDebugOpen?: boolean
  defaultLeftOpen?: boolean
}

function subscribeNarrow(onStoreChange: () => void) {
  const mql = window.matchMedia('(max-width: 900px)')
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getNarrowSnapshot() {
  return window.matchMedia('(max-width: 900px)').matches
}

function getNarrowServerSnapshot() {
  return false
}

/**
 * Shared playground chrome: big product stage in the middle, debug (and
 * optional secondary) rails on the sides. Narrow viewports use Sheets.
 */
export function StageShell({
  stage,
  debug,
  debugTitle = '调试',
  left,
  leftTitle = '侧栏',
  defaultDebugOpen = true,
  defaultLeftOpen = false,
}: StageShellProps) {
  const narrow = useSyncExternalStore(subscribeNarrow, getNarrowSnapshot, getNarrowServerSnapshot)
  const [leftOpen, setLeftOpen] = useState(defaultLeftOpen)
  const [debugOpen, setDebugOpen] = useState(defaultDebugOpen)
  const hasLeft = left != null

  if (narrow) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {hasLeft ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline">
                  <PanelLeft className="size-3.5" />
                  {leftTitle}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(100%,22rem)]">
                <SheetHeader>
                  <SheetTitle>{leftTitle}</SheetTitle>
                </SheetHeader>
                <div className="mt-4 h-[calc(100vh-6rem)] overflow-auto">{left}</div>
              </SheetContent>
            </Sheet>
          ) : null}
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline">
                <SlidersHorizontal className="size-3.5" />
                {debugTitle}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(100%,22rem)]">
              <SheetHeader>
                <SheetTitle>{debugTitle}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 h-[calc(100vh-6rem)] overflow-auto">{debug}</div>
            </SheetContent>
          </Sheet>
        </div>
        <ProductStage>{stage}</ProductStage>
      </div>
    )
  }

  const leftCol = hasLeft ? (leftOpen ? '14rem' : '2.5rem') : null
  const debugCol = debugOpen ? '22rem' : '2.5rem'

  return (
    <div
      className="grid min-h-[min(80vh,44rem)] gap-3"
      style={{
        gridTemplateColumns: leftCol
          ? `${leftCol} minmax(0,1fr) ${debugCol}`
          : `minmax(0,1fr) ${debugCol}`,
      }}
    >
      {hasLeft ? (
        <aside className="paper-sheet flex min-h-0 flex-col p-2">
          {leftOpen ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-xs font-medium text-muted-foreground">{leftTitle}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => setLeftOpen(false)}
                >
                  <PanelLeftClose className="size-3.5" />
                  收起
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">{left}</div>
            </div>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-full w-full"
              onClick={() => setLeftOpen(true)}
              aria-label={`展开${leftTitle}`}
            >
              <PanelLeft className="size-4" />
            </Button>
          )}
        </aside>
      ) : null}

      <ProductStage>{stage}</ProductStage>

      <aside className="paper-sheet flex min-h-0 flex-col p-2">
        {debugOpen ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-xs font-medium text-muted-foreground">{debugTitle}</p>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1"
                onClick={() => setDebugOpen(false)}
              >
                <PanelRightClose className="size-3.5" />
                收起
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{debug}</div>
          </div>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-full w-full"
            onClick={() => setDebugOpen(true)}
            aria-label={`展开${debugTitle}`}
          >
            <PanelRight className="size-4" />
          </Button>
        )}
      </aside>
    </div>
  )
}

function ProductStage({ children }: { children: ReactNode }) {
  const productSurfaceMode = useConfig((s) => s.productSurfaceMode)
  const floating = productSurfaceMode === 'floating'
  return (
    <section className="product-stage relative flex min-h-[min(80vh,44rem)] min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 bg-card/90 px-3 py-1.5">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
          {floating ? '用户界面 · 悬浮模拟' : '用户界面 · 窗口模式'}
        </p>
      </div>
      <div className={floating ? 'relative min-h-0 flex-1 bg-desk' : 'relative min-h-0 flex-1 bg-background'}>
        {children}
      </div>
    </section>
  )
}

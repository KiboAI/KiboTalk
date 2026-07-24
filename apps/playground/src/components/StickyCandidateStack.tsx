import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReplyCandidate } from '@kibotalk/conversation'
import { ScrollArea } from '@kibotalk/ui'
import type { ProductSurfaceMode } from '../config-store'
import { StickyNote, StickyNotePlaceholder } from './StickyNote'
import { WindowRoundCard, WindowRoundPlaceholder } from './WindowRoundCard'

export type CandidateRound = {
  id: string
  candidates: ReplyCandidate[]
}

export type CandidateRoundStackProps = {
  rounds: CandidateRound[]
  maxRounds: number
  surface: ProductSurfaceMode
  streaming?: boolean
  emptyHint?: string
}

const spring = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.85 }

/**
 * Newest round on top. Sticky yellow only in floating surface; window uses paper cards.
 */
export function CandidateRoundStack({
  rounds,
  maxRounds,
  surface,
  streaming = false,
  emptyHint = '开始会话后，回复建议会出现在这里',
}: CandidateRoundStackProps) {
  const reduceMotion = useReducedMotion()
  const viewportRef = useRef<HTMLDivElement>(null)
  const visible = rounds.slice(0, Math.max(1, maxRounds))
  const empty = visible.length === 0 && !streaming
  const newestId = visible[0]?.id ?? null
  const floating = surface === 'floating'

  useEffect(() => {
    if (!newestId) return
    const viewport = viewportRef.current
    if (viewport) viewport.scrollTop = 0
  }, [newestId])

  return (
    <ScrollArea
      className={floating ? 'h-full w-full' : 'h-[min(72vh,40rem)] w-full'}
      viewportRef={viewportRef}
      viewportClassName={floating ? 'px-2 pb-28 pt-6' : 'px-2 pb-6 pt-4'}
    >
      <div className="flex w-full flex-col items-center gap-6">
        <AnimatePresence initial={false} mode="popLayout">
          {streaming ? (
            <motion.div
              key="streaming"
              layout
              initial={reduceMotion ? false : { opacity: 0, y: -20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
              transition={reduceMotion ? { duration: 0.15 } : spring}
              className="flex w-full flex-col items-center"
            >
              {floating ? (
                <StickyNotePlaceholder label="正在生成建议…" />
              ) : (
                <WindowRoundPlaceholder label="正在生成建议…" />
              )}
            </motion.div>
          ) : null}

          {empty ? (
            <motion.div
              key="empty"
              layout
              initial={false}
              className="flex w-full flex-col items-center"
            >
              {floating ? (
                <StickyNotePlaceholder label={emptyHint} />
              ) : (
                <WindowRoundPlaceholder label={emptyHint} />
              )}
            </motion.div>
          ) : null}

          {visible.map((round, roundIndex) => {
            const isLatest = roundIndex === 0
            const ageOpacity = isLatest ? 1 : Math.max(0.58, 1 - roundIndex * 0.2)
            return (
              <motion.div
                key={round.id}
                layout
                initial={reduceMotion ? false : { opacity: 0, y: -28, scale: 0.96 }}
                animate={{ opacity: ageOpacity, y: 0, scale: isLatest ? 1 : 0.98 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.97 }}
                transition={reduceMotion ? { duration: 0.2 } : spring}
                style={{ zIndex: visible.length - roundIndex }}
                className="flex w-full flex-col items-center"
              >
                {!isLatest ? (
                  <p className="mb-2 text-center text-xs text-muted-foreground">上一轮</p>
                ) : null}
                {floating ? (
                  <StickyNote candidates={round.candidates} roundIndex={roundIndex} />
                ) : (
                  <WindowRoundCard
                    candidates={round.candidates}
                    label={isLatest ? '本轮建议' : undefined}
                  />
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ScrollArea>
  )
}

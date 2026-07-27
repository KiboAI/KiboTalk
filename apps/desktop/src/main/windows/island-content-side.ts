import type { IslandContentSide } from '../../shared/ipc'

export type Rect = { x: number; y: number; width: number; height: number }

export const ISLAND_CENTER_OFFSET = 29
export const FLIP_HYSTERESIS = 48

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function rectIntersectionArea(a: Rect, b: Rect): number {
  const left = Math.max(a.x, b.x)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const top = Math.max(a.y, b.y)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const width = right - left
  const height = bottom - top
  return width > 0 && height > 0 ? width * height : 0
}

/** Display whose workArea intersects the window most (unequal dual monitors). */
export function pickDisplayWorkArea(
  bounds: Rect,
  displays: Array<{ id: number; workArea: Rect }>,
): { id: number; workArea: Rect } {
  let best = displays[0]
  if (!best) throw new Error('no displays')
  let bestArea = -1
  for (const display of displays) {
    const area = rectIntersectionArea(bounds, display.workArea)
    if (area > bestArea) {
      best = display
      bestArea = area
    }
  }
  if (bestArea > 0) return best
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  let nearest = best
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const display of displays) {
    const area = display.workArea
    const clampedX = clamp(centerX, area.x, area.x + area.width)
    const clampedY = clamp(centerY, area.y, area.y + area.height)
    const distance = (clampedX - centerX) ** 2 + (clampedY - centerY) ** 2
    if (distance < nearestDistance) {
      nearest = display
      nearestDistance = distance
    }
  }
  return nearest
}

export function islandBarYForSide(bounds: Rect, side: IslandContentSide): number {
  return side === 'above'
    ? bounds.y + bounds.height - ISLAND_CENTER_OFFSET
    : bounds.y + ISLAND_CENTER_OFFSET
}

/**
 * Side-independent probe: visible overlap center on the chosen display.
 * Falls back to window center when there is no overlap.
 */
export function probeYForFlip(bounds: Rect, workArea: Rect): number {
  const left = Math.max(bounds.x, workArea.x)
  const right = Math.min(bounds.x + bounds.width, workArea.x + workArea.width)
  const top = Math.max(bounds.y, workArea.y)
  const bottom = Math.min(bounds.y + bounds.height, workArea.y + workArea.height)
  if (right > left && bottom > top) return (top + bottom) / 2
  return bounds.y + bounds.height / 2
}

export function decideIslandContentSide(input: {
  bounds: Rect
  currentSide: IslandContentSide
  displays: Array<{ id: number; workArea: Rect }>
}): {
  desired: IslandContentSide
  displayId: number
  workArea: Rect
  midpoint: number
  probeY: number
  islandBarY: number
} {
  const display = pickDisplayWorkArea(input.bounds, input.displays)
  const workArea = display.workArea
  const midpoint = workArea.y + workArea.height / 2
  const probeY = probeYForFlip(input.bounds, workArea)
  const islandBarY = islandBarYForSide(input.bounds, input.currentSide)
  const desired =
    probeY < midpoint - FLIP_HYSTERESIS
      ? 'below'
      : probeY > midpoint + FLIP_HYSTERESIS
        ? 'above'
        : input.currentSide
  return {
    desired,
    displayId: display.id,
    workArea,
    midpoint,
    probeY,
    islandBarY,
  }
}

/** Menu open direction locked to content side (no second heuristic). */
export function menuSideForContentSide(contentSide: IslandContentSide): 'top' | 'bottom' {
  return contentSide === 'above' ? 'top' : 'bottom'
}

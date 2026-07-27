import type { IslandBarOffset, IslandContentSide } from '../../shared/ipc'

export type Rect = { x: number; y: number; width: number; height: number }
type Point = { x: number; y: number }

export const FLIP_HYSTERESIS = 48

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

/** Display containing the draggable Island bar, or the nearest one. */
export function pickDisplayForPoint(
  point: Point,
  displays: Array<{ id: number; workArea: Rect }>,
): { id: number; workArea: Rect } {
  let nearest = displays[0]
  if (!nearest) throw new Error('no displays')
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const display of displays) {
    const { workArea } = display
    const clampedX = clamp(point.x, workArea.x, workArea.x + workArea.width)
    const clampedY = clamp(point.y, workArea.y, workArea.y + workArea.height)
    const distance = (clampedX - point.x) ** 2 + (clampedY - point.y) ** 2
    if (distance < nearestDistance) {
      nearest = display
      nearestDistance = distance
    }
  }
  return nearest
}

export function islandBarPoint(bounds: Rect, offset: IslandBarOffset): Point {
  return {
    x: bounds.x + offset.x,
    y: bounds.y + offset.y,
  }
}

/** Move only the window shell so the visible Island bar stays fixed on screen. */
export function boundsKeepingIslandBarFixed(
  bounds: Rect,
  currentSide: IslandContentSide,
  nextSide: IslandContentSide,
  currentBarOffset: IslandBarOffset,
): { bounds: Rect; barOffset: IslandBarOffset } {
  if (currentSide === nextSide) {
    return { bounds, barOffset: currentBarOffset }
  }
  const nextBarOffset = {
    x: currentBarOffset.x,
    y: bounds.height - currentBarOffset.y,
  }
  return {
    bounds: {
      ...bounds,
      y: bounds.y + currentBarOffset.y - nextBarOffset.y,
    },
    barOffset: nextBarOffset,
  }
}

export function decideIslandContentSide(input: {
  bounds: Rect
  currentSide: IslandContentSide
  barOffset: IslandBarOffset
  displays: Array<{ id: number; workArea: Rect }>
}): {
  desired: IslandContentSide
  displayId: number
  workArea: Rect
  midpoint: number
  islandBarY: number
} {
  const barPoint = islandBarPoint(input.bounds, input.barOffset)
  const display = pickDisplayForPoint(barPoint, input.displays)
  const workArea = display.workArea
  const midpoint = workArea.y + workArea.height / 2
  const desired =
    barPoint.y < midpoint - FLIP_HYSTERESIS
      ? 'below'
      : barPoint.y > midpoint + FLIP_HYSTERESIS
        ? 'above'
        : input.currentSide
  return {
    desired,
    displayId: display.id,
    workArea,
    midpoint,
    islandBarY: barPoint.y,
  }
}

/** Menu open direction locked to content side (no second heuristic). */
export function menuSideForContentSide(contentSide: IslandContentSide): 'top' | 'bottom' {
  return contentSide === 'above' ? 'top' : 'bottom'
}

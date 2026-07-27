/**
 * Agent-runnable flip harness using the user's logged dual-monitor geometry.
 * Run: pnpm exec tsx apps/desktop/scripts/verify-island-flip.ts
 */
import {
  boundsKeepingIslandBarFixed,
  decideIslandContentSide,
  islandBarPoint,
  menuSideForContentSide,
  type Rect,
} from '../src/main/windows/island-content-side'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IslandShell } from '../../../packages/pages/src/IslandShell'

/** From logged dual-monitor geometry (unequal vertical stack). */
const DISPLAYS = [
  { id: 1, workArea: { x: 0, y: 34, width: 1710, height: 1073 } },
  { id: 3, workArea: { x: -409, y: -1410, width: 2560, height: 1348 } },
]

const WINDOW = { width: 420, height: 723 }
const BAR_EDGE_OFFSET = 33

function barOffsetForSide(side: 'above' | 'below') {
  return {
    x: WINDOW.width / 2,
    y: side === 'above' ? WINDOW.height - BAR_EDGE_OFFSET : BAR_EDGE_OFFSET,
  }
}

function placeBarOnDisplay(
  displayWorkArea: Rect,
  vertical: 'upper' | 'lower',
  currentSide: 'above' | 'below',
): Rect {
  const x = displayWorkArea.x + displayWorkArea.width - WINDOW.width - 24
  const barY =
    displayWorkArea.y
    + displayWorkArea.height * (vertical === 'upper' ? 0.25 : 0.75)
  const barOffset = barOffsetForSide(currentSide)
  const y = Math.round(barY - barOffset.y)
  return { x, y, width: WINDOW.width, height: WINDOW.height }
}

type Case = {
  name: string
  bounds: Rect
  currentSide: 'above' | 'below'
  expect: 'above' | 'below'
  expectDisplay: number
}

const cases: Case[] = [
  {
    name: 'lower screen upper-half bar with content currently above → below',
    bounds: placeBarOnDisplay(DISPLAYS[0]!.workArea, 'upper', 'above'),
    currentSide: 'above',
    expect: 'below',
    expectDisplay: 1,
  },
  {
    name: 'lower screen upper-half bar stays below',
    bounds: placeBarOnDisplay(DISPLAYS[0]!.workArea, 'upper', 'below'),
    currentSide: 'below',
    expect: 'below',
    expectDisplay: 1,
  },
  {
    name: 'lower screen lower-half bar with content currently below → above',
    bounds: placeBarOnDisplay(DISPLAYS[0]!.workArea, 'lower', 'below'),
    currentSide: 'below',
    expect: 'above',
    expectDisplay: 1,
  },
  {
    name: 'lower screen lower-half bar stays above',
    bounds: placeBarOnDisplay(DISPLAYS[0]!.workArea, 'lower', 'above'),
    currentSide: 'above',
    expect: 'above',
    expectDisplay: 1,
  },
  {
    name: 'upper screen upper-half bar with content currently above → below',
    bounds: placeBarOnDisplay(DISPLAYS[1]!.workArea, 'upper', 'above'),
    currentSide: 'above',
    expect: 'below',
    expectDisplay: 3,
  },
  {
    name: 'upper screen upper-half bar stays below',
    bounds: placeBarOnDisplay(DISPLAYS[1]!.workArea, 'upper', 'below'),
    currentSide: 'below',
    expect: 'below',
    expectDisplay: 3,
  },
  {
    name: 'upper screen lower-half bar with content currently below → above',
    bounds: placeBarOnDisplay(DISPLAYS[1]!.workArea, 'lower', 'below'),
    currentSide: 'below',
    expect: 'above',
    expectDisplay: 3,
  },
  {
    name: 'upper screen lower-half bar stays above',
    bounds: placeBarOnDisplay(DISPLAYS[1]!.workArea, 'lower', 'above'),
    currentSide: 'above',
    expect: 'above',
    expectDisplay: 3,
  },
]

let failed = 0

for (const side of ['above', 'below'] as const) {
  const markup = renderToStaticMarkup(createElement(IslandShell, {
    contentSide: side,
    content: null,
    island: createElement('div', { 'data-test-island': true }),
  }))
  const contentIndex = markup.indexOf('data-island-content-slot')
  const islandIndex = markup.indexOf('data-test-island')
  const contentSlotExists = contentIndex >= 0
  const orderMatches =
    side === 'above'
      ? contentIndex < islandIndex
      : islandIndex < contentIndex
  const ok = contentSlotExists && orderMatches
  if (!ok) failed += 1
  console.log(
    `${ok ? 'PASS' : 'FAIL'} no-content renderer slot ${side}\n`
      + `  contentSlotExists=${contentSlotExists} orderMatches=${orderMatches}`,
  )
}

for (const item of cases) {
  const barOffset = barOffsetForSide(item.currentSide)
  const result = decideIslandContentSide({
    bounds: item.bounds,
    currentSide: item.currentSide,
    barOffset,
    displays: DISPLAYS,
  })
  const menu = menuSideForContentSide(result.desired)
  const actualBarY = islandBarPoint(item.bounds, barOffset).y
  const settled = boundsKeepingIslandBarFixed(
    item.bounds,
    item.currentSide,
    result.desired,
    barOffset,
  )
  const settledBarY = islandBarPoint(settled.bounds, settled.barOffset).y
  const repeated = decideIslandContentSide({
    bounds: settled.bounds,
    currentSide: result.desired,
    barOffset: settled.barOffset,
    displays: DISPLAYS,
  })
  const ok =
    result.desired === item.expect
    && result.displayId === item.expectDisplay
    && settledBarY === actualBarY
    && repeated.desired === result.desired
    && repeated.displayId === result.displayId
  if (!ok) failed += 1
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${item.name}\n` +
      `  bounds.y=${item.bounds.y} current=${item.currentSide} → ${result.desired} (expect ${item.expect})\n` +
      `  display=${result.displayId} (expect ${item.expectDisplay}) mid=${result.midpoint} barY=${actualBarY} settledY=${settled.bounds.y} repeat=${repeated.desired} menu=${menu}`,
  )
}

// Menu must match content side (single value).
for (const side of ['above', 'below'] as const) {
  const menu = menuSideForContentSide(side)
  const expect = side === 'above' ? 'top' : 'bottom'
  const ok = menu === expect
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} menu mapping ${side} → ${menu} (expect ${expect})`)
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`)
  process.exit(1)
}
console.log('\nAll island flip cases passed.')

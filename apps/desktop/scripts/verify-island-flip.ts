/**
 * Agent-runnable flip harness using the user's logged dual-monitor geometry.
 * Run: pnpm exec tsx apps/desktop/scripts/verify-island-flip.ts
 */
import {
  decideIslandContentSide,
  menuSideForContentSide,
  type Rect,
} from '../src/main/windows/island-content-side'

/** From logged dual-monitor geometry (unequal vertical stack). */
const DISPLAYS = [
  { id: 1, workArea: { x: 0, y: 34, width: 1710, height: 1073 } },
  { id: 3, workArea: { x: -409, y: -1410, width: 2560, height: 1348 } },
]

const WINDOW = { width: 420, height: 723 }

function placeOnDisplay(
  displayWorkArea: Rect,
  vertical: 'upper' | 'lower',
): Rect {
  const x = displayWorkArea.x + displayWorkArea.width - WINDOW.width - 24
  const y =
    vertical === 'upper'
      ? displayWorkArea.y + 8
      : displayWorkArea.y + displayWorkArea.height - WINDOW.height - 8
  return { x, y, width: WINDOW.width, height: WINDOW.height }
}

type Case = {
  name: string
  bounds: Rect
  currentSide: 'above' | 'below'
  expect: 'above' | 'below'
}

const cases: Case[] = [
  {
    name: 'lower screen upper half → content below bar',
    bounds: placeOnDisplay(DISPLAYS[0]!.workArea, 'upper'),
    currentSide: 'above',
    expect: 'below',
  },
  {
    name: 'lower screen lower half → content above bar',
    bounds: placeOnDisplay(DISPLAYS[0]!.workArea, 'lower'),
    currentSide: 'below',
    expect: 'above',
  },
  {
    name: 'upper screen upper half → content below bar',
    bounds: placeOnDisplay(DISPLAYS[1]!.workArea, 'upper'),
    currentSide: 'above',
    expect: 'below',
  },
  {
    name: 'upper screen lower half → content above bar',
    bounds: placeOnDisplay(DISPLAYS[1]!.workArea, 'lower'),
    currentSide: 'below',
    expect: 'above',
  },
  {
    name: 'lower screen upper half stays below when already below',
    bounds: placeOnDisplay(DISPLAYS[0]!.workArea, 'upper'),
    currentSide: 'below',
    expect: 'below',
  },
  {
    name: 'lower screen lower half stays above when already above',
    bounds: placeOnDisplay(DISPLAYS[0]!.workArea, 'lower'),
    currentSide: 'above',
    expect: 'above',
  },
]

let failed = 0
for (const item of cases) {
  const result = decideIslandContentSide({
    bounds: item.bounds,
    currentSide: item.currentSide,
    displays: DISPLAYS,
  })
  const menu = menuSideForContentSide(result.desired)
  const ok = result.desired === item.expect
  if (!ok) failed += 1
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${item.name}\n` +
      `  bounds.y=${item.bounds.y} current=${item.currentSide} → ${result.desired} (expect ${item.expect})\n` +
      `  display=${result.displayId} probeY=${result.probeY.toFixed(1)} mid=${result.midpoint} barY=${result.islandBarY} menu=${menu}`,
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

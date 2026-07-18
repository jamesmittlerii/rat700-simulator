/**
 * Silk-screen mult ties matching the Programmierfeld diagram.
 * Only draw a segment where the silk actually commons jack centers.
 */

import {
  ABSCHALT_COL,
  AMP_STRIPS,
  COMPARATOR_BLOCKS,
  FG_COLS,
  FREE_DIODE_BLOCKS,
  FREE_DIODE_VERTICAL_PAIRS,
  MASSE_O_STUB_COLS,
  MASSE_P_COLS,
  ME_BLOCKS,
  MULTIPLIER_BANKS,
  POT_SECTIONS,
  SUMMER_ONLY_BLOCKS,
  SWITCHABLE_BLOCKS,
  UNGROUNDED_POT_NUMBERS,
  VERFUEGBAR_EDGE_COL,
  VERFUEGBAR_LEFT_COLS,
  VERFUEGBAR_RIGHT_COLS,
  rowIndex,
  type RowLetter,
} from './jackMap'

export interface SilkSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Thin rectangular section outlines on the Programmierfeld silk. */
export interface SilkRect {
  x: number
  y: number
  w: number
  h: number
}

const cx = (col1: number) => col1 - 0.5
const cy = (row: number) => row + 0.5

function hTie(colA: number, colB: number, row: number): SilkSegment {
  const a = Math.min(colA, colB)
  const b = Math.max(colA, colB)
  return { x1: cx(a), y1: cy(row), x2: cx(b), y2: cy(row) }
}

function vTie(col1: number, rowA: number, rowB: number): SilkSegment {
  const a = Math.min(rowA, rowB)
  const b = Math.max(rowA, rowB)
  return { x1: cx(col1), y1: cy(a), x2: cx(col1), y2: cy(b) }
}

/** Box around inclusive 1-based cols and inclusive row letters (shared edges). */
function sectionBox(
  colA: number,
  colB: number,
  rowA: RowLetter,
  rowB: RowLetter,
): SilkRect {
  const c0 = Math.min(colA, colB)
  const c1 = Math.max(colA, colB)
  const r0 = Math.min(rowIndex(rowA), rowIndex(rowB))
  const r1 = Math.max(rowIndex(rowA), rowIndex(rowB))
  return {
    x: c0 - 1,
    y: r0,
    w: c1 - c0 + 1,
    h: r1 - r0 + 1,
  }
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const sorted = intervals
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const out: [number, number][] = []
  for (const [a, b] of sorted) {
    const last = out.at(-1)
    if (!last || a > last[1] + 1e-9) out.push([a, b])
    else last[1] = Math.max(last[1], b)
  }
  return out
}

/**
 * Section outlines as unique shared edge lines (one stroke between neighbors).
 * Potentiometer sections with an ungrounded low are L-shaped so n5 / n13 /
 * n18 / n26 sit inside the pot outline (no bar between m and that low).
 */
export function buildSilkSectionLines(): SilkSegment[] {
  const boxes = buildSilkSections()
  const horiz = new Map<string, [number, number][]>()
  const vert = new Map<string, [number, number][]>()

  const key = (n: number) => n.toFixed(4)
  const push = (
    map: Map<string, [number, number][]>,
    fixed: number,
    a: number,
    b: number,
  ) => {
    const k = key(fixed)
    const list = map.get(k) ?? []
    list.push([a, b])
    map.set(k, list)
  }

  for (const box of boxes) {
    const x0 = box.x
    const x1 = box.x + box.w
    const y0 = box.y
    const y1 = box.y + box.h
    push(horiz, y0, x0, x1)
    push(horiz, y1, x0, x1)
    push(vert, x0, y0, y1)
    push(vert, x1, y0, y1)
  }

  // Pot L-outlines (not plain rectangles — omit the m/n bar over the low jack).
  for (const section of POT_SECTIONS) {
    const cols = [...section.cols]
    const x0 = cols[0]! - 1
    const x1 = cols.at(-1)!
    const y0 = rowIndex('l')
    const yM = rowIndex('m') + 1
    const yN = rowIndex('n') + 1
    const lowIdx = section.pots.findIndex((p) =>
      (UNGROUNDED_POT_NUMBERS as readonly number[]).includes(p),
    )
    push(horiz, y0, x0, x1) // top
    if (lowIdx < 0) {
      push(horiz, yM, x0, x1)
      push(vert, x0, y0, yM)
      push(vert, x1, y0, yM)
      continue
    }
    const lowCol = cols[lowIdx]!
    const xl = lowCol - 1
    const xr = lowCol
    if (lowIdx === 0) {
      // Low on the left (pots 11, 16 → n18, n26).
      push(vert, x0, y0, yN)
      push(vert, x1, y0, yM)
      push(horiz, yM, xr, x1)
      push(vert, xr, yM, yN)
      push(horiz, yN, x0, xr)
    } else {
      // Low on the right (pots 5, 10 → n5, n13).
      push(vert, x0, y0, yM)
      push(vert, x1, y0, yN)
      push(horiz, yM, x0, xl)
      push(vert, xl, yM, yN)
      push(horiz, yN, xl, x1)
    }
  }

  // Masse: row-p bar cols 12–19 with upward stubs at o13 / o18 (no o↔p bar there).
  {
    const cols = [...MASSE_P_COLS]
    const x0 = cols[0]! - 1
    const x1 = cols.at(-1)!
    const yTop = rowIndex('o')
    const yMid = rowIndex('p')
    const yBot = rowIndex('p') + 1
    const stubSpans = [...MASSE_O_STUB_COLS]
      .map((c) => [c - 1, c] as const)
      .sort((a, b) => a[0] - b[0])

    push(horiz, yBot, x0, x1)
    push(vert, x0, yMid, yBot)
    push(vert, x1, yMid, yBot)

    let cursor = x0
    for (const [xl, xr] of stubSpans) {
      if (cursor < xl) push(horiz, yMid, cursor, xl)
      push(horiz, yTop, xl, xr)
      push(vert, xl, yTop, yMid)
      push(vert, xr, yTop, yMid)
      cursor = xr
    }
    if (cursor < x1) push(horiz, yMid, cursor, x1)
  }

  const segs: SilkSegment[] = []
  for (const [yKey, intervals] of horiz) {
    const y = Number(yKey)
    for (const [a, b] of mergeIntervals(intervals)) {
      segs.push({ x1: a, y1: y, x2: b, y2: y })
    }
  }
  for (const [xKey, intervals] of vert) {
    const x = Number(xKey)
    for (const [a, b] of mergeIntervals(intervals)) {
      segs.push({ x1: x, y1: a, x2: x, y2: b })
    }
  }
  return segs
}

/**
 * Section outlines matching the museum Programmierfeld boxes.
 */
export function buildSilkSections(): SilkRect[] {
  const boxes: SilkRect[] = []

  // Switchable Σ/∫ strips — full config + computing band a–k.
  for (const block of SWITCHABLE_BLOCKS) {
    const [c0, c1] = block.cols
    boxes.push(sectionBox(c0, c1, 'a', 'k'))
  }

  // Summer-only strips — compact computing band g–k.
  for (const block of SUMMER_ONLY_BLOCKS) {
    const [c0, c1] = block.cols
    boxes.push(sectionBox(c0, c1, 'g', 'k'))
  }

  // Funktionsgeber columns a–d.
  boxes.push(
    sectionBox(FG_COLS.F1, FG_COLS.F1, 'a', 'd'),
    sectionBox(FG_COLS.F2, FG_COLS.F2, 'a', 'd'),
  )

  // Multiplikator banks a–d.
  for (const bank of MULTIPLIER_BANKS) {
    const cols = bank.cols
    boxes.push(sectionBox(cols[0], cols.at(-1)!, 'a', 'd'))
  }

  // Potentiometer sections are drawn as L-shapes in buildSilkSectionLines
  // (ungrounded lows n5 / n13 / n18 / n26 stay inside the pot outline).

  // Freie Dioden l–o.
  for (const block of FREE_DIODE_BLOCKS) {
    const cols = block.cols
    boxes.push(sectionBox(cols[0], cols.at(-1)!, 'l', 'o'))
  }

  // Potentialfreie Stützpunkte.
  boxes.push(sectionBox(6, 6, 'l', 'o'), sectionBox(25, 25, 'l', 'o'))

  // Komparator-Relais row p.
  for (const block of COMPARATOR_BLOCKS) {
    const cols = block.cols
    boxes.push(sectionBox(cols[0], cols.at(-1)!, block.row, block.row))
  }

  // Masse is drawn as an L-outline in buildSilkSectionLines
  // (stubs o13 / o18 join the p12–p19 ground field).

  // +ME/−ME metering under each pot section.
  for (const block of ME_BLOCKS) {
    const cols = block.cols
    boxes.push(sectionBox(cols[0], cols.at(-1)!, 'n', 'o'))
  }

  // Abschaltleitung (AS) — bottom left.
  boxes.push(sectionBox(ABSCHALT_COL, ABSCHALT_COL, 'n', 'o'))

  // verfügbar spare fields — bottom left / right row p.
  boxes.push(
    sectionBox(
      VERFUEGBAR_LEFT_COLS[0],
      VERFUEGBAR_LEFT_COLS.at(-1)!,
      'p',
      'p',
    ),
    sectionBox(
      VERFUEGBAR_RIGHT_COLS[0],
      VERFUEGBAR_RIGHT_COLS.at(-1)!,
      'p',
      'p',
    ),
    sectionBox(VERFUEGBAR_EDGE_COL, VERFUEGBAR_EDGE_COL, 'n', 'n'),
    sectionBox(VERFUEGBAR_EDGE_COL, VERFUEGBAR_EDGE_COL, 'o', 'o'),
  )

  return boxes
}

/**
 * Amp strips (manual §3.7.1 + silk):
 * - Left column: independent gain inputs — no vertical commons.
 * - Right column: paralleled amp outs — vertical mult on g–k only (e/f not in that bus).
 * - Rows l/m: no left↔right silk commons (diagram has none).
 */
export function buildSilkTies(): SilkSegment[] {
  const segs: SilkSegment[] = []

  for (const strip of AMP_STRIPS) {
    const [, right] = strip.cols
    // Right-column output mult: vertical g–k only (not e–f into that chain).
    segs.push(vTie(right, rowIndex('g'), rowIndex('k')))
  }

  // Multiplikator: two green jacks per input row are paralleled; red outs stack.
  for (const bank of MULTIPLIER_BANKS) {
    const [c0, c1, c2] = bank.cols
    for (const row of [0, 1, 2, 3]) {
      segs.push(hTie(c0, c1, row))
    }
    segs.push(vTie(c2, 0, 2))
  }

  // Freie Dioden: vertical l–m / n–o ties per column; diode glyph is horizontal.
  for (const block of FREE_DIODE_BLOCKS) {
    for (const col1 of block.cols) {
      for (const [r0, r1] of FREE_DIODE_VERTICAL_PAIRS) {
        segs.push(vTie(col1, rowIndex(r0), rowIndex(r1)))
      }
    }
  }

  // Masse ground bus on row p, with stubs up to o13 / o18.
  segs.push(hTie(MASSE_P_COLS[0], MASSE_P_COLS.at(-1)!, rowIndex('p')))
  for (const col1 of MASSE_O_STUB_COLS) {
    segs.push(vTie(col1, rowIndex('o'), rowIndex('p')))
  }

  // Function-generator parallel outs (rows b–d).
  segs.push(vTie(5, 1, 3), vTie(23, 1, 3))

  return segs
}

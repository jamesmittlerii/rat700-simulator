/**
 * Authentic RAT 700 Programmierfeld coordinates.
 * Columns 1–30, rows a–p omitting j (15 rows).
 *
 * Amp strips are 2 columns (left = labeled inputs, right = parallel mult).
 * Mult paint: e–f white; g–k terracotta orange (museum + silk diagram).
 */

export const PATCH_COLS = 30
export const PATCH_ROWS = 15
export const POT_SLOTS = 20
export const AMP_SLOTS = 15
export const MULTIPLIER_SLOTS = 4

/** Row letters a–p skipping j → index 0..14 */
export const ROW_LETTERS = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
] as const

export type RowLetter = (typeof ROW_LETTERS)[number]

export function rowIndex(letter: RowLetter): number {
  return ROW_LETTERS.indexOf(letter)
}

export function rowLetter(index: number): RowLetter {
  return ROW_LETTERS[index] ?? 'a'
}

/** Switchable Σ/∫ amp blocks (amps 01,02,05,06,10,11,14,15). */
export const SWITCHABLE_BLOCKS = [
  { amp: 1, ampSlot: 0, cols: [1, 2] as const },
  { amp: 2, ampSlot: 1, cols: [3, 4] as const },
  { amp: 5, ampSlot: 4, cols: [9, 10] as const },
  { amp: 6, ampSlot: 5, cols: [11, 12] as const },
  { amp: 10, ampSlot: 9, cols: [19, 20] as const },
  { amp: 11, ampSlot: 10, cols: [21, 22] as const },
  { amp: 14, ampSlot: 13, cols: [27, 28] as const },
  { amp: 15, ampSlot: 14, cols: [29, 30] as const },
] as const

/**
 * Summer-only amps — compact g–k strips (1 / 10 / 10 / S).
 * Column pairs match the museum silk-screen (left=inputs, right=mult).
 */
export const SUMMER_ONLY_BLOCKS = [
  { amp: 3, cols: [5, 6] as const },
  { amp: 4, cols: [7, 8] as const },
  { amp: 7, cols: [13, 14] as const },
  { amp: 8, cols: [15, 16] as const },
  { amp: 9, cols: [17, 18] as const },
  { amp: 12, cols: [23, 24] as const },
  { amp: 13, cols: [25, 26] as const },
] as const

/** All 15 amp strips as { amp, leftCol, rightCol }. */
export const AMP_STRIPS: readonly {
  amp: number
  cols: readonly [number, number]
  switchable: boolean
}[] = [
  ...SWITCHABLE_BLOCKS.map((b) => ({
    amp: b.amp,
    cols: b.cols,
    switchable: true,
  })),
  ...SUMMER_ONLY_BLOCKS.map((b) => ({
    amp: b.amp,
    cols: b.cols,
    switchable: false,
  })),
].sort((a, b) => a.amp - b.amp)

/** Left (primary / green) column for each amp 1–15. */
export const AMP_PRIMARY_COL: Record<number, number> = Object.fromEntries(
  AMP_STRIPS.map((s) => [s.amp, s.cols[0]]),
)

/** Right (mult / orange) column for each amp 1–15. */
export const AMP_MULT_COL: Record<number, number> = Object.fromEntries(
  AMP_STRIPS.map((s) => [s.amp, s.cols[1]]),
)

export function ampStrip(ampNumber: number) {
  return AMP_STRIPS.find((s) => s.amp === ampNumber)
}

export const FG_COLS = { F1: 5, F2: 23 } as const

export const MULTIPLIER_BANKS = [
  { index: 0, cols: [6, 7, 8] as const },
  { index: 1, cols: [13, 14, 15] as const },
  { index: 2, cols: [16, 17, 18] as const },
  { index: 3, cols: [24, 25, 26] as const },
] as const

/**
 * Potentiometer sections (museum + silk): 5 pots per section.
 * Rows l/m carry high side and wiper; row n is only live for the
 * ungrounded low-side pots 5, 10, 11, and 16.
 */
export const POT_SECTIONS = [
  { section: 1, pots: [1, 2, 3, 4, 5] as const, cols: [1, 2, 3, 4, 5] as const },
  { section: 2, pots: [6, 7, 8, 9, 10] as const, cols: [9, 10, 11, 12, 13] as const },
  { section: 3, pots: [11, 12, 13, 14, 15] as const, cols: [18, 19, 20, 21, 22] as const },
  { section: 4, pots: [16, 17, 18, 19, 20] as const, cols: [26, 27, 28, 29, 30] as const },
] as const

/** Potentiometer jack columns in slot order 1–20. */
export const POT_COLS = POT_SECTIONS.flatMap((s) => [...s.cols]) as [
  1,
  2,
  3,
  4,
  5,
  9,
  10,
  11,
  12,
  13,
  18,
  19,
  20,
  21,
  22,
  26,
  27,
  28,
  29,
  30,
]

export const UNGROUNDED_POT_NUMBERS = [5, 10, 11, 16] as const

/**
 * Freie Dioden — yellow jack fields (silk diagram + §3.5).
 * Each block spans rows l–o; anode/cathode pairs are silk-screened per column.
 */
export const FREE_DIODE_BLOCKS = [
  { cols: [7, 8] as const, rows: ['l', 'm', 'n', 'o'] as const },
  { cols: [14, 15, 16, 17] as const, rows: ['l', 'm', 'n', 'o'] as const },
  { cols: [23, 24] as const, rows: ['l', 'm', 'n', 'o'] as const },
] as const

/**
 * Komparator-Relais — orange jack fields on row p (silk diagram).
 * Left block K1 cols 7–11; right block K2 cols 20–24.
 */
export const COMPARATOR_BLOCKS = [
  { id: 'K1', cols: [7, 8, 9, 10, 11] as const, row: 'p' as const },
  { id: 'K2', cols: [20, 21, 22, 23, 24] as const, row: 'p' as const },
] as const

/**
 * Reference Machine Units & Metering (§3.7 grid; rows n/o).
 * +ME (+10 V) on row n = orange, −ME (−10 V) on row o = blue
 * (museum panel photo). Grouped over the pot blocks.
 */
export const ME_COLS = [2, 3, 4, 10, 11, 12, 19, 20, 21, 27, 28, 29] as const

export function isSwitchableAmp(ampNumber: number): boolean {
  return SWITCHABLE_BLOCKS.some((b) => b.amp === ampNumber)
}

export function switchableBlockForCol(col: number) {
  return SWITCHABLE_BLOCKS.find((b) => (b.cols as readonly number[]).includes(col))
}

/** Legal 4-pin mode jumper placements for a switchable column (uses left col of pair). */
export function modeJumperSites(ampSlot: number): {
  position: 'sigma' | 'integral'
  col: number
  rows: [RowLetter, RowLetter]
}[] {
  const block = SWITCHABLE_BLOCKS.find((b) => b.ampSlot === ampSlot)
  if (!block) return []
  const col = block.cols[0]
  return [
    { position: 'sigma', col, rows: ['a', 'b'] },
    { position: 'integral', col, rows: ['b', 'c'] },
  ]
}

export function timeJumperSites(ampSlot: number): {
  position: '1' | '10'
  col: number
  rows: [RowLetter, RowLetter]
}[] {
  const block = SWITCHABLE_BLOCKS.find((b) => b.ampSlot === ampSlot)
  if (!block) return []
  const col = block.cols[0]
  return [
    { position: '1', col, rows: ['c', 'd'] },
    { position: '10', col, rows: ['d', 'e'] },
  ]
}

export function jackId(col: number, row: RowLetter | number): string {
  const r = typeof row === 'number' ? rowLetter(row) : row
  return `${col}${r}`
}

/**
 * Input jack plan for an amp strip.
 * Switchable: full e–k (×1,×1,×1,×10,×10,S).
 * Summer-only: compact g–k (×1,×10,×10,S) as on the museum silk.
 */
export function ampInputPlan(ampNumber: number): {
  row: number
  port: string
  gainLabel: string
}[] {
  if (isSwitchableAmp(ampNumber)) {
    return [
      { row: rowIndex('e'), port: 'in0', gainLabel: '1' },
      { row: rowIndex('f'), port: 'in1', gainLabel: '1' },
      { row: rowIndex('g'), port: 'in2', gainLabel: '1' },
      { row: rowIndex('h'), port: 'in3', gainLabel: '10' },
      { row: rowIndex('i'), port: 'in4', gainLabel: '10' },
      { row: rowIndex('k'), port: 's', gainLabel: 'S' },
    ]
  }
  return [
    { row: rowIndex('g'), port: 'in0', gainLabel: '1' },
    { row: rowIndex('h'), port: 'in3', gainLabel: '10' },
    { row: rowIndex('i'), port: 'in4', gainLabel: '10' },
    { row: rowIndex('k'), port: 's', gainLabel: 'S' },
  ]
}

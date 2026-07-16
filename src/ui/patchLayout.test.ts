import { describe, expect, it } from 'vitest'
import { createNode } from '../engine/elements'
import { loadHarmonicOscillator } from '../presets/harmonicOscillator'
import { loadVehicleSuspension } from '../presets/vehicleSuspension'
import {
  ampInputPlan,
  ampStrip,
  AMP_STRIPS,
  COMPARATOR_BLOCKS,
  FREE_DIODE_BLOCKS,
  MULTIPLIER_BANKS,
  buildPatchLayout,
  findPortCell,
  isLegalModeJumper,
  isLegalTimeJumper,
  PATCH_COLS,
  PATCH_ROWS,
  POT_COLS,
  POT_SECTIONS,
  rowLetter,
  SWITCHABLE_LEFT_COLS,
  UNGROUNDED_POT_NUMBERS,
} from '../ui/patchLayout'
import { rowIndex } from '../ui/jackMap'

describe('jack map legality', () => {
  it('accepts legal mode/time jumpers on switchable columns', () => {
    expect(isLegalModeJumper(SWITCHABLE_LEFT_COLS[0]!, 'sigma')).toBe(true)
    expect(isLegalModeJumper(SWITCHABLE_LEFT_COLS[0]!, 'integral')).toBe(true)
    expect(isLegalModeJumper(5, 'sigma')).toBe(false)
    expect(isLegalTimeJumper(1, '1')).toBe(true)
    expect(isLegalTimeJumper(1, '10')).toBe(true)
  })

  it('defines 15 two-column amp strips', () => {
    expect(AMP_STRIPS).toHaveLength(15)
    expect(ampStrip(3)?.cols).toEqual([5, 6])
    expect(ampStrip(1)?.cols).toEqual([1, 2])
  })

  it('summer-only g–k plan is 1 / 10 / 10 / S', () => {
    const plan = ampInputPlan(3)
    expect(plan.map((p) => p.gainLabel)).toEqual(['1', '10', '10', 'S'])
    expect(plan.map((p) => rowLetter(p.row))).toEqual(['g', 'h', 'i', 'k'])
  })
})

describe('patch layout', () => {
  it('fills a complete 30×15 board', () => {
    const m = loadHarmonicOscillator()
    const cells = buildPatchLayout(m.nodes)
    expect(cells).toHaveLength(PATCH_COLS * PATCH_ROWS)
    const keys = new Set(cells.map((c) => `${c.col},${c.row}`))
    expect(keys.size).toBe(PATCH_COLS * PATCH_ROWS)
  })

  it('maps oscillator ports to live jacks', () => {
    const m = loadHarmonicOscillator()
    const cells = buildPatchLayout(m.nodes)
    const int1Out = findPortCell(cells, { nodeId: 'int_1', port: 'out' })
    const potIn = findPortCell(cells, { nodeId: 'pot_1', port: 'in' })
    const refP = findPortCell(cells, { nodeId: 'ref_p10', port: 'out' })
    expect(int1Out?.color).toBe('red')
    expect(potIn?.color).toBe('green')
    // +10 V reference surfaces on the +ME metering jacks (red per manual).
    expect(refP?.color).toBe('red')

    for (const cable of m.cables) {
      expect(findPortCell(cells, cable.from)).toBeTruthy()
      expect(findPortCell(cells, cable.to)).toBeTruthy()
    }
  })

  it('pairs green inputs with white e–f mults and orange g–k mults', () => {
    const m = loadHarmonicOscillator()
    const cells = buildPatchLayout(m.nodes)
    // Amp 01 = cols 1–2 (0-based 0–1), switchable e–k
    const eLeft = cells.find(
      (c) =>
        c.ampNumber === 1 &&
        c.col === 0 &&
        c.row === 4 &&
        c.color === 'green' &&
        c.ref,
    )
    expect(eLeft).toBeTruthy()
    const eRight = cells.find(
      (c) =>
        c.ampNumber === 1 &&
        c.col === 1 &&
        c.row === 4 &&
        c.color === 'white',
    )
    expect(eRight).toBeTruthy()
    expect(eRight!.ref).toEqual(eLeft!.ref)

    const gLeft = cells.find(
      (c) =>
        c.ampNumber === 1 &&
        c.col === 0 &&
        c.row === 6 &&
        c.color === 'green' &&
        c.ref,
    )
    expect(gLeft).toBeTruthy()
    const gRight = cells.find(
      (c) =>
        c.ampNumber === 1 &&
        c.col === 1 &&
        c.row === 6 &&
        c.color === 'orange',
    )
    expect(gRight).toBeTruthy()
    expect(gRight!.ref).toEqual(gLeft!.ref)
  })

  it('paints rows e–f as green|white across every amp strip', () => {
    const m = loadHarmonicOscillator()
    const cells = buildPatchLayout(m.nodes)
    for (const strip of AMP_STRIPS) {
      const [left1, right1] = strip.cols
      for (const row of [4, 5]) {
        const left = cells.find((c) => c.col === left1 - 1 && c.row === row)
        const right = cells.find((c) => c.col === right1 - 1 && c.row === row)
        expect(left?.color).toBe('green')
        expect(right?.color).toBe('white')
      }
    }
  })

  it('paints rows g–k as green|orange across every amp strip', () => {
    const m = loadHarmonicOscillator()
    const cells = buildPatchLayout(m.nodes)
    for (const strip of AMP_STRIPS) {
      const [left1, right1] = strip.cols
      for (const row of [6, 7, 8, 9]) {
        const left = cells.find((c) => c.col === left1 - 1 && c.row === row)
        const right = cells.find((c) => c.col === right1 - 1 && c.row === row)
        expect(left?.color).toBe('green')
        expect(right?.color).toBe('orange')
      }
    }
  })

  it('maps vehicle preset cables onto the board', () => {
    const m = loadVehicleSuspension('firm')
    const cells = buildPatchLayout(m.nodes)
    const missing = m.cables.filter(
      (c) => !findPortCell(cells, c.from) || !findPortCell(cells, c.to),
    )
    expect(missing).toEqual([])
  })

  it('places all vehicle computing amps on the 15 strips (no overflow)', () => {
    const m = loadVehicleSuspension('firm')
    const computing = m.nodes.filter(
      (n) =>
        n.kind === 'integrator' || n.kind === 'summer' || n.kind === 'inverter',
    )
    expect(computing).toHaveLength(15)
    expect(
      computing.every((n) => n.ampSlot != null && n.ampSlot >= 0 && n.ampSlot < 15),
    ).toBe(true)
    // Layout assigns strips by computing-amp order; first 15 never hit overflow
    const cells = buildPatchLayout(m.nodes)
    for (const amp of computing) {
      expect(findPortCell(cells, { nodeId: amp.id, port: 'out' })).toBeTruthy()
      const stripCells = cells.filter(
        (c) => c.ref?.nodeId === amp.id && c.ampNumber != null,
      )
      expect(stripCells.length).toBeGreaterThan(0)
      expect(stripCells.every((c) => (c.ampNumber ?? 99) <= 15)).toBe(true)
    }
  })

  it('maps section 1 pots on l/m with pot 5 low on n', () => {
    const cells = buildPatchLayout(loadHarmonicOscillator().nodes)
    const lRow = rowIndex('l')
    const mRow = rowIndex('m')
    const nRow = rowIndex('n')

    for (const col1 of [1, 2, 3, 4, 5]) {
      const high = cells.find((c) => c.col === col1 - 1 && c.row === lRow)
      const wiper = cells.find((c) => c.col === col1 - 1 && c.row === mRow)
      expect(high?.color).toBe('green')
      expect(wiper?.color).toBe('orange')
    }

    const pot1In = findPortCell(cells, { nodeId: 'pot_1', port: 'in' })
    const pot1Out = findPortCell(cells, { nodeId: 'pot_1', port: 'out' })
    expect(pot1In?.col).toBe(0)
    expect(pot1In?.row).toBe(lRow)
    expect(pot1Out?.col).toBe(0)
    expect(pot1Out?.row).toBe(mRow)

    const pot5Low = cells.find((c) => c.col === 4 && c.row === nRow)
    expect(pot5Low?.color).toBe('green')
    expect(pot5Low?.label).toContain('P05 low')
  })

  it('defines four pot sections and live lows only for isolated pots', () => {
    const potNodes = Array.from({ length: POT_COLS.length }, (_, slot) =>
      createNode('potentiometer', `pot_${slot + 1}`, `Pot ${slot + 1}`, 0, 0),
    )
    const cells = buildPatchLayout(potNodes)
    const lRow = rowIndex('l')
    const mRow = rowIndex('m')
    const nRow = rowIndex('n')

    expect(POT_SECTIONS.map((s) => [...s.cols])).toEqual([
      [1, 2, 3, 4, 5],
      [9, 10, 11, 12, 13],
      [18, 19, 20, 21, 22],
      [26, 27, 28, 29, 30],
    ])

    for (const [slot, col1] of POT_COLS.entries()) {
      const potNumber = slot + 1
      expect(cells.find((c) => c.col === col1 - 1 && c.row === lRow)?.color).toBe(
        'green',
      )
      expect(cells.find((c) => c.col === col1 - 1 && c.row === mRow)?.color).toBe(
        'orange',
      )

      const low = findPortCell(cells, { nodeId: `pot_${potNumber}`, port: 'low' })
      if ((UNGROUNDED_POT_NUMBERS as readonly number[]).includes(potNumber)) {
        expect(low?.col).toBe(col1 - 1)
        expect(low?.row).toBe(nRow)
        expect(low?.color).toBe('green')
      } else {
        expect(low).toBeUndefined()
      }
    }
  })

  it('paints freie Dioden blocks yellow on rows l–o', () => {
    const cells = buildPatchLayout(loadVehicleSuspension('firm').nodes)
    for (const block of FREE_DIODE_BLOCKS) {
      for (const col1 of block.cols) {
        for (const letter of block.rows) {
          const row = rowIndex(letter)
          const cell = cells.find((c) => c.col === col1 - 1 && c.row === row)
          expect(cell).toBeTruthy()
          expect(cell?.color).toBe('yellow')
          expect(cell?.ref).toBeUndefined()
        }
      }
    }
  })

  it('paints Multiplikator banks as paired green inputs, red outs, white G', () => {
    const cells = buildPatchLayout(loadVehicleSuspension('firm').nodes)
    for (const bank of MULTIPLIER_BANKS) {
      const [c0, c1, c2] = bank.cols
      for (const col1 of [c0, c1]) {
        for (const row of [0, 1, 2, 3]) {
          expect(
            cells.find((c) => c.col === col1 - 1 && c.row === row)?.color,
          ).toBe('green')
        }
      }
      for (const row of [0, 1, 2]) {
        expect(cells.find((c) => c.col === c2 - 1 && c.row === row)?.color).toBe(
          'red',
        )
      }
      expect(cells.find((c) => c.col === c2 - 1 && c.row === 3)?.color).toBe(
        'white',
      )
    }
  })

  it('paints Komparator-Relais brown on row p (cols 7–11 and 20–24)', () => {
    const cells = buildPatchLayout(loadVehicleSuspension('firm').nodes)
    expect(COMPARATOR_BLOCKS.map((b) => [...b.cols])).toEqual([
      [7, 8, 9, 10, 11],
      [20, 21, 22, 23, 24],
    ])
    for (const block of COMPARATOR_BLOCKS) {
      const row = rowIndex(block.row)
      expect(row).toBe(14)
      for (const col1 of block.cols) {
        const cell = cells.find((c) => c.col === col1 - 1 && c.row === row)
        expect(cell).toBeTruthy()
        expect(cell?.color).toBe('brown')
        expect(cell?.label).toBe(block.id)
        expect(cell?.ref).toBeUndefined()
      }
    }
  })

  it('paints +ME row n red and −ME row o blue', () => {
    const cells = buildPatchLayout(loadHarmonicOscillator().nodes)
    const nRow = rowIndex('n')
    const oRow = rowIndex('o')
    const plus = cells.find((c) => c.row === nRow && c.color === 'red' && c.ref)
    const minus = cells.find((c) => c.row === oRow && c.color === 'blue' && c.ref)
    expect(plus?.label).toBe('+ME')
    expect(minus?.label).toBe('−ME')
  })

  it('keeps switchable Σ/∫ config columns (rows a–d) all white', () => {
    const switchableCols0 = [1, 2, 3, 4, 9, 10, 11, 12, 19, 20, 21, 22, 27, 28, 29, 30].map(
      (c) => c - 1,
    )
    for (const m of [loadHarmonicOscillator(), loadVehicleSuspension('firm')]) {
      const cells = buildPatchLayout(m.nodes)
      const offenders = cells.filter(
        (c) =>
          c.row <= 3 &&
          switchableCols0.includes(c.col) &&
          c.color !== 'white',
      )
      expect(offenders).toEqual([])
    }
  })
})

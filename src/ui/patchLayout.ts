/**
 * Bind live circuit ports onto the authentic 30×15 Programmierfeld.
 */

import { portsFor } from '../engine/elements'
import type { CircuitNode, PortDef, PortDirection, PortRef } from '../engine/types'
import {
  AMP_PRIMARY_COL,
  AMP_SLOTS,
  AMP_STRIPS,
  COMPARATOR_BLOCKS,
  FG_COLS,
  FREE_DIODE_BLOCKS,
  MASSE_O_STUB_COLS,
  MASSE_P_COLS,
  ME_COLS,
  MULTIPLIER_BANKS,
  PATCH_COLS,
  PATCH_ROWS,
  POT_COLS,
  POT_SECTIONS,
  POT_SLOTS,
  ROW_LETTERS,
  SWITCHABLE_BLOCKS,
  UNGROUNDED_POT_NUMBERS,
  ampInputPlan,
  ampStrip,
  ampTrayRows,
  diodeBlocksAmpTray,
  freeDiodeLabel,
  isFreeDiodeCell,
  isSwitchableAmp,
  jackId,
  modeJumperSites,
  rowIndex,
  rowLetter,
  timeJumperSites,
  type RowLetter,
} from './jackMap'

export {
  PATCH_COLS,
  PATCH_ROWS,
  POT_SLOTS,
  AMP_SLOTS,
  ROW_LETTERS,
  SWITCHABLE_BLOCKS,
  AMP_PRIMARY_COL,
  AMP_STRIPS,
  COMPARATOR_BLOCKS,
  FG_COLS,
  FREE_DIODE_BLOCKS,
  MASSE_O_STUB_COLS,
  MASSE_P_COLS,
  ME_COLS,
  MULTIPLIER_BANKS,
  POT_COLS,
  POT_SECTIONS,
  UNGROUNDED_POT_NUMBERS,
  isSwitchableAmp,
  jackId,
  modeJumperSites,
  timeJumperSites,
  rowLetter,
  rowIndex,
  ampInputPlan,
  ampStrip,
  ampTrayRows,
  diodeBlocksAmpTray,
  freeDiodeLabel,
  isFreeDiodeCell,
}

export const AMP_COLS = 15

export type JackColor =
  | 'white'
  | 'orange'
  | 'green'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'black'
  | 'brown'
  | 'pink'

export interface PatchCell {
  col: number
  row: number
  color: JackColor
  ref?: PortRef
  direction?: PortDirection
  label: string
  /** Short silk-screen mark drawn beside the jack (1, 10, S, Σ, G, …). */
  mark?: string
  unused?: boolean
  jackId: string
  ampNumber?: number
  potSlot?: number
}

function cell(
  col1: number,
  row: number,
  color: JackColor,
  label: string,
  ref?: PortRef,
  direction?: PortDirection,
  extra?: Partial<PatchCell>,
): PatchCell {
  const letter = rowLetter(row)
  return {
    col: col1 - 1,
    row,
    color,
    label,
    ref,
    direction,
    unused: !ref,
    jackId: jackId(col1, letter),
    ...extra,
  }
}

function isComputingAmp(n: CircuitNode): boolean {
  return n.kind === 'integrator' || n.kind === 'summer' || n.kind === 'inverter'
}

/** Legal 4-pin mode jumper on switchable left columns. */
export function isLegalModeJumper(
  col1: number,
  position: 'sigma' | 'integral',
): boolean {
  return SWITCHABLE_BLOCKS.some(
    (b) => b.cols[0] === col1 && (position === 'sigma' || position === 'integral'),
  )
}

export function isLegalTimeJumper(
  col1: number,
  position: '1' | '10',
): boolean {
  return SWITCHABLE_BLOCKS.some(
    (b) => b.cols[0] === col1 && (position === '1' || position === '10'),
  )
}

export const SWITCHABLE_LEFT_COLS = SWITCHABLE_BLOCKS.map((b) => b.cols[0])

/**
 * Assign each live element port to the museum-faithful 30×15 board.
 * UI columns are 0-based; physical columns are 1-based in jackMap.
 */
export function buildPatchLayout(nodes: CircuitNode[]): PatchCell[] {
  const grid = new Map<string, PatchCell>()
  const place = (c: PatchCell) => {
    const key = `${c.col},${c.row}`
    const prev = grid.get(key)
    // Prefer live refs over unused silk
    if (prev?.ref && !c.ref) return
    grid.set(key, c)
  }
  const forcePlace = (c: PatchCell) => {
    grid.set(`${c.col},${c.row}`, c)
  }

  const pots = nodes.filter((n) => n.kind === 'potentiometer').slice(0, POT_SLOTS)
  const fgs = nodes.filter((n) => n.kind === 'functionGenerator').slice(0, 2)
  const mults = nodes.filter((n) => n.kind === 'multiplier').slice(0, 4)
  const signals = nodes.filter((n) => n.kind === 'signal')
  const refP = nodes.find((n) => n.kind === 'reference' && n.voltage === 10)
  const refM = nodes.find((n) => n.kind === 'reference' && n.voltage === -10)
  const refG = nodes.find((n) => n.kind === 'reference' && n.voltage === 0)

  /**
   * Peripheral silk cells (0-based col,row) reserved from opportunistic
   * fallback placement so museum labels/colors survive: verfügbar, AS,
   * Stützpunkte, and Masse grounds. Diode fields handled by isFreeDiodeCell.
   */
  const reservedSilk = new Set<string>()
  const reserve = (col1: number, row: number) =>
    reservedSilk.add(`${col1 - 1},${row}`)
  for (const col1 of [1, 2, 3, 4, 5, 6]) reserve(col1, rowIndex('p')) // verfügbar L
  for (const col1 of [25, 26, 27, 28, 29, 30]) reserve(col1, rowIndex('p')) // verfügbar R / peripherals
  reserve(30, rowIndex('n')) // pink utility
  reserve(30, rowIndex('o')) // pink utility
  reserve(1, rowIndex('n')) // AS
  reserve(1, rowIndex('o')) // AS
  for (const col1 of [6, 25]) {
    for (const letter of ['l', 'm', 'n', 'o'] as const) reserve(col1, rowIndex(letter))
  }
  reserve(5, rowIndex('o')) // Masse o5
  reserve(26, rowIndex('o')) // Masse o26
  for (const col1 of MASSE_P_COLS) {
    reserve(col1, rowIndex('p')) // Masse
  }
  for (const col1 of MASSE_O_STUB_COLS) {
    reserve(col1, rowIndex('o')) // Masse stubs o13 / o18
  }
  for (const block of COMPARATOR_BLOCKS) {
    for (const col1 of block.cols) reserve(col1, rowIndex(block.row))
  }
  // +ME/−ME metering fields (rows n/o).
  for (const col1 of ME_COLS) {
    reserve(col1, rowIndex('n'))
    reserve(col1, rowIndex('o'))
  }
  // Potentiometer sections: keep the high/wiper rows (and live lows) out of
  // opportunistic fallback so the museum green/orange silk survives instead of
  // being stolen by overflow amp ports or the final ensurePort pass.
  for (const section of POT_SECTIONS) {
    for (const col1 of section.cols) {
      reserve(col1, rowIndex('l'))
      reserve(col1, rowIndex('m'))
    }
    for (const [i, potNumber] of section.pots.entries()) {
      if ((UNGROUNDED_POT_NUMBERS as readonly number[]).includes(potNumber)) {
        reserve(section.cols[i]!, rowIndex('n'))
      }
    }
  }
  const isReservedSilk = (col0: number, row: number) =>
    reservedSilk.has(`${col0},${row}`)

  // Fill unused silk first
  for (let col1 = 1; col1 <= PATCH_COLS; col1++) {
    for (let row = 0; row < PATCH_ROWS; row++) {
      place(cell(col1, row, 'white', ''))
    }
  }

  // Config silk a–d on switchable pairs
  for (const block of SWITCHABLE_BLOCKS) {
    for (const col1 of block.cols) {
      place(cell(col1, 0, 'white', `Σ ${block.amp}`, undefined, undefined, { mark: 'Σ' }))
      place(cell(col1, 1, 'white', `Σ/∫ ${block.amp}`, undefined, undefined, { mark: 'Σ/∫' }))
      place(cell(col1, 2, 'white', `∫ ${block.amp}`, undefined, undefined, { mark: '∫' }))
    }
    // Row d: capacitor selector pair (horizontal 1 / 10 short).
    const [leftCol, rightCol] = block.cols
    place(cell(leftCol, 3, 'white', `1 ${block.amp}`, undefined, undefined, { mark: '1' }))
    place(cell(rightCol, 3, 'white', `10 ${block.amp}`, undefined, undefined, { mark: '10' }))
  }

  /**
   * Amplifiers — museum + manual §3.7.1:
   * Left column = dark green gain inputs (independent; not left↔right commoned).
   * Right column = paralleled amp outputs (white e–f / orange g–k on photo;
   * red on tray row m). Switchable: e–k inputs. Summer-only: g–k inputs.
   */
  const outMultColorForRow = (row: number): JackColor =>
    row === 4 || row === 5 ? 'white' : 'orange'

  // Full-width amp-band silk on every strip (live ports overwrite):
  // e–f green|white, g–k green|orange
  for (const strip of AMP_STRIPS) {
    const [leftCol, rightCol] = strip.cols
    const tag = String(strip.amp).padStart(2, '0')
    const leftMarks: Record<number, string> = {
      4: '1',
      5: '1',
      6: '1',
      7: '10',
      8: '10',
      9: 'S',
    }
    for (const row of [4, 5]) {
      place(
        cell(leftCol, row, 'green', `${tag} silk ×1`, undefined, undefined, {
          mark: leftMarks[row],
          ampNumber: strip.amp,
        }),
      )
      place(
        cell(rightCol, row, 'white', `${tag} silk out`, undefined, undefined, {
          ampNumber: strip.amp,
        }),
      )
    }
    for (const row of [6, 7, 8, 9]) {
      place(
        cell(leftCol, row, 'green', `${tag} silk`, undefined, undefined, {
          mark: leftMarks[row],
          ampNumber: strip.amp,
        }),
      )
      place(
        cell(rightCol, row, 'orange', `${tag} silk out`, undefined, undefined, {
          ampNumber: strip.amp,
        }),
      )
    }
  }

  const allAmps = nodes.filter(isComputingAmp)
  allAmps.forEach((amp, idx) => {
    const ampNumber = idx + 1
    const tag = String(ampNumber).padStart(2, '0')
    const ports = portsFor(amp.kind, amp)
    const strip = ampStrip(ampNumber)

    if (idx < AMP_SLOTS && strip) {
      const [leftCol, rightCol] = strip.cols

      const { aux: trayAuxRow, out: trayOutRow, split: traySplit } =
        ampTrayRows(leftCol, rightCol)

      const outRef = { nodeId: amp.id, port: 'out' }
      const inputRows = ampInputPlan(ampNumber).map((s) => s.row)
      // Right column of the input band = paralleled amp-output mults.
      // Amp number is silk between k/l (not on the jacks).
      for (const row of inputRows) {
        place(
          cell(
            rightCol,
            row,
            outMultColorForRow(row),
            `${tag} Out`,
            outRef,
            'out',
            { ampNumber },
          ),
        )
      }

      if (amp.kind === 'inverter') {
        const plan0 = ampInputPlan(ampNumber)[0]!
        place(
          cell(
            leftCol,
            plan0.row,
            'green',
            `${tag} ${amp.label} In`,
            { nodeId: amp.id, port: 'in' },
            'in',
            { ampNumber, mark: '1' },
          ),
        )
      } else {
        for (const step of ampInputPlan(ampNumber)) {
          const p = ports.find((x) => x.name === step.port)
          if (!p) continue
          place(
            cell(
              leftCol,
              step.row,
              'green',
              `${tag} ${amp.label} ×${step.gainLabel}`,
              { nodeId: amp.id, port: step.port },
              'in',
              { ampNumber, mark: step.gainLabel },
            ),
          )
        }
      }

      // Tray IC/R/G/Out — prefer rows l/m; skip freie Dioden fields.
      if (amp.kind === 'integrator') {
        const icRef = { nodeId: amp.id, port: 'ic' }
        const aRow = rowIndex('l')
        if (!isFreeDiodeCell(leftCol, aRow)) {
          place(
            cell(leftCol, aRow, 'white', `${tag} A`, icRef, 'in', {
              ampNumber,
              mark: 'A',
            }),
          )
        }
        if (!isFreeDiodeCell(rightCol, aRow)) {
          place(
            cell(rightCol, aRow, 'white', `${tag} A`, icRef, 'in', {
              ampNumber,
              mark: 'A',
            }),
          )
        }
      } else if (amp.kind === 'summer' && !traySplit) {
        const r = ports.find((x) => x.name === 'r')
        if (r && !isFreeDiodeCell(leftCol, trayAuxRow)) {
          place(
            cell(
              leftCol,
              trayAuxRow,
              'white',
              `${tag} R`,
              { nodeId: amp.id, port: 'r' },
              'in',
              { ampNumber, mark: 'R' },
            ),
          )
        }
        const g = ports.find((x) => x.name === 'g')
        if (g && !isFreeDiodeCell(rightCol, trayAuxRow)) {
          place(
            cell(
              rightCol,
              trayAuxRow,
              'white',
              `${tag} G`,
              { nodeId: amp.id, port: 'g' },
              'in',
              { ampNumber, mark: 'G' },
            ),
          )
        }
      }

      // Tray row m: paralleled red outs when the cell is not a pot wiper column.
      // Pot sections share cols with amp strips; wipers keep row m there.
      // Amp-output mults remain on the right-column e–k / g–k band.
      if (!traySplit) {
        for (const col1 of [leftCol, rightCol]) {
          if (isFreeDiodeCell(col1, trayOutRow)) continue
          if ((POT_COLS as readonly number[]).includes(col1)) continue
          place(
            cell(col1, trayOutRow, 'red', `${tag} Out`, outRef, 'out', {
              ampNumber,
            }),
          )
        }
      }
      return
    }

    // Overflow multi-chassis amps → free cells scanned bottom-up
    // (rows a–d stay reserved for white config silk)
    const freeKeys = (): [number, number][] => {
      const out: [number, number][] = []
      for (let r = PATCH_ROWS - 1; r >= 0; r--) {
        for (let c = 0; c < PATCH_COLS; c++) {
          if (isFreeDiodeCell(c + 1, r) || isReservedSilk(c, r)) continue
          const e = grid.get(`${c},${r}`)
          // Only blank panel silk — never steal museum-colored or labeled cells.
          if (e && !e.ref && e.color === 'white' && !e.label && !e.mark) {
            out.push([c, r])
          }
        }
      }
      return out
    }

    const claim = (
      portName: string,
      dir: PortDirection,
      color: JackColor,
    ) => {
      const p = ports.find((x) => x.name === portName)
      if (!p) return
      const spot = freeKeys()[0]
      if (!spot) return
      const [c, r] = spot
      place(
        cell(
          c + 1,
          r,
          color,
          `${tag} ${amp.label} ${p.label ?? portName}`,
          { nodeId: amp.id, port: portName },
          dir,
          { ampNumber },
        ),
      )
    }

    if (amp.kind === 'inverter') {
      claim('in', 'in', 'green')
      claim('out', 'out', 'red')
    } else if (amp.kind === 'integrator') {
      claim('in0', 'in', 'green')
      claim('in1', 'in', 'green')
      claim('ic', 'in', 'white')
      claim('out', 'out', 'red')
    } else {
      claim('in0', 'in', 'green')
      claim('in1', 'in', 'green')
      claim('in2', 'in', 'green')
      claim('out', 'out', 'red')
    }
  })

  // Function generators cols 5 / 23
  fgs.forEach((fg, i) => {
    const col1 = i === 0 ? FG_COLS.F1 : FG_COLS.F2
    const name = `F${i + 1}`
    place(
      cell(
        col1,
        0,
        'green',
        `${name} In`,
        { nodeId: fg.id, port: 'in' },
        'in',
        { mark: name },
      ),
    )
    for (const row of [1, 2, 3]) {
      place(
        cell(
          col1,
          row,
          'orange',
          `${name} Out`,
          { nodeId: fg.id, port: 'out' },
          'out',
          { mark: 'f' },
        ),
      )
    }
  })

  // Multiplikator silk (always) — museum photo / §3.7.1:
  // two parallel green jacks for each of +X, +Y, −X, −Y; the right column
  // has three red network outputs and the white G jack at the bottom.
  for (const bank of MULTIPLIER_BANKS) {
    const [c0, c1, c2] = bank.cols
    const tag = `M${bank.index + 1}`
    const inputLabels = ['+X', '+Y', '−X', '−Y'] as const
    for (let row = 0; row < 4; row++) {
      place(
        cell(c0, row, 'green', `${tag} ${inputLabels[row]}`, undefined, undefined, {
          mark: inputLabels[row],
        }),
      )
      place(cell(c1, row, 'green', `${tag} ${inputLabels[row]} parallel`))
    }
    for (const row of [0, 1, 2]) {
      place(cell(c2, row, 'red', `${tag} Out`))
    }
    place(
      cell(c2, 3, 'white', `${tag} G`, undefined, undefined, { mark: 'G' }),
    )
  }

  // Multipliers — live ports on the silk map
  mults.forEach((m, i) => {
    const bank = MULTIPLIER_BANKS[i]
    if (!bank) return
    const [c0, c1, c2] = bank.cols
    const marks: Record<string, string> = {
      xp: '+X',
      yp: '+Y',
      xm: '−X',
      ym: '−Y',
      g: 'G',
    }
    const map: [number, number, string, JackColor, PortDirection][] = [
      [c0, 0, 'xp', 'green', 'in'],
      [c1, 0, 'xp', 'green', 'in'],
      [c0, 1, 'yp', 'green', 'in'],
      [c1, 1, 'yp', 'green', 'in'],
      [c0, 2, 'xm', 'green', 'in'],
      [c1, 2, 'xm', 'green', 'in'],
      [c0, 3, 'ym', 'green', 'in'],
      [c1, 3, 'ym', 'green', 'in'],
      [c2, 0, 'out', 'red', 'out'],
      [c2, 1, 'out', 'red', 'out'],
      [c2, 2, 'out', 'red', 'out'],
      [c2, 3, 'g', 'white', 'out'],
    ]
    for (const [col1, row, port, color, dir] of map) {
      place(
        cell(
          col1,
          row,
          color,
          `M${i + 1} ${port}`,
          { nodeId: m.id, port },
          dir,
          { mark: marks[port] },
        ),
      )
    }
  })

  /**
   * Find a free cell, checking preferred spots first, then scanning the
   * board bottom-up so fallbacks never invade the white a–d config band.
   */
  const firstFree = (
    preferred: [number, number][] = [],
  ): [number, number] | undefined => {
    const usable = ([c, r]: [number, number]) =>
      !isFreeDiodeCell(c + 1, r) && !isReservedSilk(c, r)
    const isBlankSilk = (e: PatchCell | undefined) =>
      !!e && !e.ref && e.color === 'white' && !e.label && !e.mark
    for (const spot of preferred) {
      if (!usable(spot)) continue
      if (isBlankSilk(grid.get(`${spot[0]},${spot[1]}`))) return spot
    }
    for (let r = PATCH_ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < PATCH_COLS; c++) {
        if (!usable([c, r])) continue
        if (isBlankSilk(grid.get(`${c},${r}`))) return [c, r]
      }
    }
    return undefined
  }

  // Potentiometer silk: four 5-pot sections on rows l/m, with only the
  // manual-isolated lows (5, 10, 11, 16) present on row n.
  const potHighRow = rowIndex('l')
  const potWiperRow = rowIndex('m')
  const potLowRow = rowIndex('n')
  const ungroundedPots = new Set<number>(UNGROUNDED_POT_NUMBERS)
  POT_COLS.forEach((col1, slot) => {
    const potNumber = slot + 1
    const tag = `P${String(potNumber).padStart(2, '0')}`
    forcePlace(
      cell(col1, potHighRow, 'green', `${tag} high`, undefined, undefined, {
        potSlot: slot,
        mark: String(potNumber),
      }),
    )
    forcePlace(
      cell(col1, potWiperRow, 'orange', `${tag} wiper`, undefined, undefined, {
        potSlot: slot,
      }),
    )
    if (ungroundedPots.has(potNumber)) {
      forcePlace(
        cell(col1, potLowRow, 'green', `${tag} low`, undefined, undefined, {
          potSlot: slot,
        }),
      )
    }
  })

  // Pots — live high/wiper use rows l/m; isolated lows use row n.
  pots.forEach((pot, slot) => {
    const potNumber = slot + 1
    const col1 = POT_COLS[slot] ?? ((slot % PATCH_COLS) + 1)
    const claim = (
      port: 'in' | 'out' | 'low',
      color: JackColor,
      row: number,
    ) => {
      forcePlace(
        cell(
          col1,
          row,
          color,
          `P${String(potNumber).padStart(2, '0')} ${pot.label} ${port}`,
          { nodeId: pot.id, port },
          port === 'out' ? 'out' : 'in',
          {
            potSlot: slot,
            mark: port === 'in' ? String(potNumber) : undefined,
          },
        ),
      )
    }
    claim('in', 'green', potHighRow)
    claim('out', 'orange', potWiperRow)
    if (ungroundedPots.has(potNumber)) {
      claim('low', 'green', potLowRow)
    }
  })

  // +ME / −ME reference-metering block (rows n/o):
  // +ME row n = red (+10 V), −ME row o = blue (−10 V)
  const nRow = rowIndex('n')
  const oRow = rowIndex('o')
  for (const col1 of ME_COLS) {
    if (refP) {
      forcePlace(
        cell(col1, nRow, 'red', '+ME', { nodeId: refP.id, port: 'out' }, 'out', {
          mark: '+E',
        }),
      )
    } else {
      forcePlace(cell(col1, nRow, 'red', '+ME', undefined, undefined, { mark: '+E' }))
    }
    if (refM) {
      forcePlace(
        cell(col1, oRow, 'blue', '−ME', { nodeId: refM.id, port: 'out' }, 'out', {
          mark: '−E',
        }),
      )
    } else {
      forcePlace(cell(col1, oRow, 'blue', '−ME', undefined, undefined, { mark: '−E' }))
    }
  }
  // Ensure at least one of each ref exists (bottom-up, keep a–d white)
  const ensureRef = (
    node: CircuitNode | undefined,
    color: JackColor,
    label: string,
  ) => {
    if (!node) return
    if ([...grid.values()].some((c) => c.ref?.nodeId === node.id)) return
    const spot = firstFree()
    if (!spot) return
    const [c, r] = spot
    place(
      cell(c + 1, r, color, label, { nodeId: node.id, port: 'out' }, 'out'),
    )
  }
  // Masse — chassis ground row p, cols 12–19 (silk §3.5).
  for (const col1 of MASSE_P_COLS) {
    forcePlace(
      cell(
        col1,
        rowIndex('p'),
        'black',
        'Masse',
        refG ? { nodeId: refG.id, port: 'out' } : undefined,
        refG ? 'out' : undefined,
      ),
    )
  }

  // Potentialfreie Stützpunkte — isolated tie-points cols 6 and 25, rows l–o.
  // Force these after amp tray placement so amp 3 stays on col 5 and amp 13
  // stays on col 26; neither may overwrite the white tie-point columns.
  for (const col1 of [6, 25]) {
    for (const letter of ['l', 'm', 'n', 'o'] as const) {
      forcePlace(cell(col1, rowIndex(letter), 'white', 'Stützpunkt'))
    }
  }

  // Masse — system common ground o5 & o26, plus section stubs o13 & o18.
  const oRowMasse = rowIndex('o')
  for (const col1 of [5, 26, ...MASSE_O_STUB_COLS]) {
    forcePlace(
      cell(
        col1,
        oRowMasse,
        'black',
        'Masse',
        refG ? { nodeId: refG.id, port: 'out' } : undefined,
        refG ? 'out' : undefined,
      ),
    )
  }

  // verfügbar — spare jack field row p cols 1–6 (pink). Road/signal out on p1 only.
  const pRow = rowIndex('p')
  const road = signals[0]
  for (const col1 of [1, 2, 3, 4, 5, 6]) {
    if (col1 === 1 && road) {
      forcePlace(
        cell(
          col1,
          pRow,
          'pink',
          `verfügbar ${road.label}`,
          { nodeId: road.id, port: 'out' },
          'out',
        ),
      )
    } else {
      place(cell(col1, pRow, 'pink', 'verfügbar'))
    }
  }

  // Row p cols 25–30 — pink utility / peripheral field (recorder & spares).
  for (const col1 of [25, 26, 27, 28, 29, 30]) {
    forcePlace(cell(col1, pRow, 'pink', 'verfügbar'))
  }

  // Col 30 rows n–o — pink utility.
  forcePlace(cell(30, rowIndex('n'), 'pink', 'verfügbar'))
  forcePlace(cell(30, rowIndex('o'), 'pink', 'verfügbar'))

  // Abschaltleitung (AS) — overload → Halt short jacks 1n / 1o (pink).
  for (const letter of ['n', 'o'] as const) {
    const row = rowIndex(letter)
    const key = `0,${row}`
    if (!grid.get(key)?.ref) place(cell(1, row, 'pink', 'AS', undefined, undefined, { mark: 'AS' }))
  }

  // Now that Masse grounds carry refG, only fill missing refs elsewhere.
  ensureRef(refP, 'red', '+10 V')
  ensureRef(refM, 'blue', '−10 V')
  ensureRef(refG, 'black', 'Ground')

  // Signal generator ports are ensured in the final pass below

  // Freie Dioden — yellow fields l7–o8, l14–o17, l23–o24 (always; no circuit refs).
  for (const block of FREE_DIODE_BLOCKS) {
    for (const col1 of block.cols) {
      for (const letter of block.rows) {
        const row = rowIndex(letter)
        forcePlace(cell(col1, row, 'yellow', freeDiodeLabel(letter)))
      }
    }
  }

  // Komparator-Relais — light brown fields on row p (K1 cols 7–11, K2 cols 20–24)
  for (const block of COMPARATOR_BLOCKS) {
    const row = rowIndex(block.row)
    for (const col1 of block.cols) {
      forcePlace(cell(col1, row, 'brown', block.id, undefined, undefined, { mark: block.id }))
    }
  }

  // Final pass: ensure every port on every non-reference node has a jack
  const ensurePort = (
    node: CircuitNode,
    portName: string,
    dir: PortDirection,
    color: JackColor,
  ) => {
    const exists = [...grid.values()].some(
      (c) => c.ref?.nodeId === node.id && c.ref.port === portName,
    )
    if (exists) return
    const spot = firstFree()
    if (!spot) return
    const [c, r] = spot
    place(
      cell(
        c + 1,
        r,
        color,
        `${node.label} ${portName}`,
        { nodeId: node.id, port: portName },
        dir,
      ),
    )
  }

  for (const n of nodes) {
    if (n.kind === 'reference') continue
    const essential =
      n.kind === 'inverter'
        ? ['in', 'out']
        : n.kind === 'potentiometer'
          ? ['in', 'out']
          : n.kind === 'integrator'
            ? ['in0', 'in1', 'ic', 'out']
            : n.kind === 'summer'
              ? ['in0', 'in1', 'in2', 'out']
              : n.kind === 'functionGenerator' || n.kind === 'multiplier'
                ? portsFor(n.kind, n).map((p) => p.name)
                : n.kind === 'signal'
                  ? ['out']
                  : ['out']
    for (const name of essential) {
      const p = portsFor(n.kind, n).find((x) => x.name === name)
      if (!p) continue
      ensurePort(n, p.name, p.direction, asColor(p.jack))
    }
  }

  return [...grid.values()].sort(
    (a, b) => a.row * PATCH_COLS + a.col - (b.row * PATCH_COLS + b.col),
  )
}

function asColor(jack: string): JackColor {
  const ok: JackColor[] = [
    'white',
    'orange',
    'green',
    'blue',
    'red',
    'yellow',
    'black',
    'brown',
    'pink',
  ]
  return (ok.includes(jack as JackColor) ? jack : 'white') as JackColor
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`
}

export function findPortCell(
  cells: PatchCell[],
  ref: PortRef,
): PatchCell | undefined {
  return cells.find(
    (c) => c.ref && c.ref.nodeId === ref.nodeId && c.ref.port === ref.port,
  )
}

export function portDefFor(
  nodes: CircuitNode[],
  ref: PortRef,
): PortDef | undefined {
  const n = nodes.find((x) => x.id === ref.nodeId)
  if (!n) return undefined
  return portsFor(n.kind, n).find((p) => p.name === ref.port)
}

export function jumperRowSpan(
  kind: 'mode4' | 'time2',
  position: string,
): [RowLetter, RowLetter] {
  if (kind === 'mode4') {
    return position === 'integral' ? ['b', 'c'] : ['a', 'b']
  }
  // Capacitor short: horizontal pair on row d (same holes for 1 and 10).
  return ['d', 'd']
}

/** Jacks occupied by a jumper placement (1-based cols, 0-based rows). */
export function jumperOccupiedJacks(
  kind: 'mode4' | 'time2',
  position: string,
  leftCol1: number,
  rightCol1: number,
): { col1: number; row: number }[] {
  const [r0, r1] = jumperRowSpan(kind, position)
  const rows = [...new Set([rowIndex(r0), rowIndex(r1)])]
  if (kind === 'mode4') {
    const out: { col1: number; row: number }[] = []
    for (const row of rows) {
      out.push({ col1: leftCol1, row }, { col1: rightCol1, row })
    }
    return out
  }
  // time2: horizontal short across both strip columns on row d
  return rows.flatMap((row) => [
    { col1: leftCol1, row },
    { col1: rightCol1, row },
  ])
}

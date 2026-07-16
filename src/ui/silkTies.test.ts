import { describe, expect, it } from 'vitest'
import {
  AMP_STRIPS,
  MULTIPLIER_BANKS,
  FREE_DIODE_BLOCKS,
  FREE_DIODE_VERTICAL_PAIRS,
  ME_BLOCKS,
  SWITCHABLE_BLOCKS,
  SUMMER_ONLY_BLOCKS,
  freeDiodeColPairs,
  freeDiodePairPointsRight,
  rowIndex,
} from './jackMap'
import { buildSilkTies, buildSilkSections, buildSilkSectionLines } from './silkTies'

describe('silk ties', () => {
  it('draws vertical out-mult only on the right amp-strip column', () => {
    const segs = buildSilkTies()
    const g = rowIndex('g')
    const k = rowIndex('k')
    for (const strip of AMP_STRIPS) {
      const [left, right] = strip.cols
      expect(
        segs.some(
          (s) =>
            s.x1 === s.x2 &&
            s.x1 === right - 0.5 &&
            Math.min(s.y1, s.y2) === g + 0.5 &&
            Math.max(s.y1, s.y2) === k + 0.5,
        ),
      ).toBe(true)
      // No e–k continuous vertical (e/f are not tied into g–k).
      const e = rowIndex('e')
      expect(
        segs.some(
          (s) =>
            s.x1 === s.x2 &&
            s.x1 === right - 0.5 &&
            Math.min(s.y1, s.y2) === e + 0.5 &&
            Math.max(s.y1, s.y2) === k + 0.5,
        ),
      ).toBe(false)
      // Left column inputs are independent — no vertical g–k commons.
      expect(
        segs.some(
          (s) =>
            s.x1 === s.x2 &&
            s.x1 === left - 0.5 &&
            Math.min(s.y1, s.y2) === g + 0.5 &&
            Math.max(s.y1, s.y2) === k + 0.5,
        ),
      ).toBe(false)
      // No horizontal g left↔right.
      expect(
        segs.some(
          (s) =>
            s.y1 === s.y2 &&
            s.y1 === g + 0.5 &&
            Math.min(s.x1, s.x2) === left - 0.5 &&
            Math.max(s.x1, s.x2) === right - 0.5,
        ),
      ).toBe(false)
      // No horizontal row-l / row-m left↔right amp tray commons.
      for (const letter of ['l', 'm'] as const) {
        const row = rowIndex(letter)
        expect(
          segs.some(
            (s) =>
              s.y1 === s.y2 &&
              s.y1 === row + 0.5 &&
              Math.min(s.x1, s.x2) === left - 0.5 &&
              Math.max(s.x1, s.x2) === right - 0.5,
          ),
        ).toBe(false)
      }
    }
  })

  it('draws multiplier paired-input and red-out ties', () => {
    const segs = buildSilkTies()
    for (const bank of MULTIPLIER_BANKS) {
      const [c0, c1, c2] = bank.cols
      expect(
        segs.some(
          (s) =>
            s.y1 === 0.5 &&
            Math.min(s.x1, s.x2) === c0 - 0.5 &&
            Math.max(s.x1, s.x2) === c1 - 0.5,
        ),
      ).toBe(true)
      expect(
        segs.some(
          (s) =>
            s.x1 === s.x2 &&
            s.x1 === c2 - 0.5 &&
            Math.min(s.y1, s.y2) === 0.5 &&
            Math.max(s.y1, s.y2) === 2.5,
        ),
      ).toBe(true)
    }
  })

  it('draws vertical diode ties and no horizontal diode mult lines', () => {
    const segs = buildSilkTies()
    for (const block of FREE_DIODE_BLOCKS) {
      for (const col1 of block.cols) {
        for (const [r0, r1] of FREE_DIODE_VERTICAL_PAIRS) {
          expect(
            segs.some(
              (s) =>
                s.x1 === s.x2 &&
                s.x1 === col1 - 0.5 &&
                Math.min(s.y1, s.y2) === rowIndex(r0) + 0.5 &&
                Math.max(s.y1, s.y2) === rowIndex(r1) + 0.5,
            ),
          ).toBe(true)
        }
      }
      for (const [c0, c1] of freeDiodeColPairs(block.cols)) {
        for (const letter of block.rows) {
          const row = rowIndex(letter)
          expect(
            segs.some(
              (s) =>
                s.y1 === s.y2 &&
                s.y1 === row + 0.5 &&
                Math.min(s.x1, s.x2) === c0 - 0.5 &&
                Math.max(s.x1, s.x2) === c1 - 0.5,
            ),
          ).toBe(false)
        }
      }
    }
  })

  it('orients freie-Dioden symbols top pair right and bottom pair left', () => {
    expect(freeDiodePairPointsRight(['l', 'm'])).toBe(true)
    expect(freeDiodePairPointsRight(['n', 'o'])).toBe(false)
  })

  it('outlines sections with shared single edge lines', () => {
    const boxes = buildSilkSections()
    expect(boxes.length).toBeGreaterThanOrEqual(
      SWITCHABLE_BLOCKS.length +
        SUMMER_ONLY_BLOCKS.length +
        MULTIPLIER_BANKS.length +
        FREE_DIODE_BLOCKS.length +
        ME_BLOCKS.length,
    )
    // Switchable 01 = cols 1–2, rows a–k.
    expect(
      boxes.some((b) => b.x === 0 && b.w === 2 && b.h === 10),
    ).toBe(true)
    // Bottom-left ME + AS + verfügbar.
    expect(boxes.some((b) => b.x === 1 && b.w === 3 && b.y === 12 && b.h === 2)).toBe(
      true,
    )
    expect(boxes.some((b) => b.x === 0 && b.w === 1 && b.y === 12 && b.h === 2)).toBe(
      true,
    )
    expect(boxes.some((b) => b.x === 0 && b.w === 6 && b.y === 14 && b.h === 1)).toBe(
      true,
    )
    // Middle ME blocks n9–o12 and n19–o22.
    expect(boxes.some((b) => b.x === 8 && b.w === 4 && b.y === 12 && b.h === 2)).toBe(
      true,
    )
    expect(boxes.some((b) => b.x === 18 && b.w === 4 && b.y === 12 && b.h === 2)).toBe(
      true,
    )
    // Bottom-right ME + verfügbar.
    expect(boxes.some((b) => b.x === 26 && b.w === 3 && b.y === 12 && b.h === 2)).toBe(
      true,
    )
    expect(boxes.some((b) => b.x === 29 && b.w === 1 && b.y === 12 && b.h === 1)).toBe(
      true,
    )
    expect(boxes.some((b) => b.x === 29 && b.w === 1 && b.y === 13 && b.h === 1)).toBe(
      true,
    )
    expect(boxes.some((b) => b.x === 24 && b.w === 6 && b.y === 14 && b.h === 1)).toBe(
      true,
    )

    const lines = buildSilkSectionLines()
    // Pot 5 / pot 16 lows are inside the pot L (no m↔n bar over that column).
    const barOverN5 = lines.some(
      (s) =>
        s.y1 === s.y2 &&
        s.y1 === rowIndex('m') + 1 &&
        Math.min(s.x1, s.x2) <= 4 &&
        Math.max(s.x1, s.x2) >= 5,
    )
    expect(barOverN5).toBe(false)
    const barOverN26 = lines.some(
      (s) =>
        s.y1 === s.y2 &&
        s.y1 === rowIndex('m') + 1 &&
        Math.min(s.x1, s.x2) <= 25 &&
        Math.max(s.x1, s.x2) >= 26,
    )
    expect(barOverN26).toBe(false)
    // Masse stubs o13 / o18 are inside the Masse L (no o↔p bar over those columns).
    const barOverO13 = lines.some(
      (s) =>
        s.y1 === s.y2 &&
        s.y1 === rowIndex('p') &&
        Math.min(s.x1, s.x2) <= 12 &&
        Math.max(s.x1, s.x2) >= 13,
    )
    expect(barOverO13).toBe(false)
    const barOverO18 = lines.some(
      (s) =>
        s.y1 === s.y2 &&
        s.y1 === rowIndex('p') &&
        Math.min(s.x1, s.x2) <= 17 &&
        Math.max(s.x1, s.x2) >= 18,
    )
    expect(barOverO18).toBe(false)
    // Shared boundary between amp 01 (cols 1–2) and 02 (cols 3–4) is one vertical.
    const shared = lines.filter(
      (s) =>
        s.x1 === s.x2 &&
        s.x1 === 2 &&
        Math.min(s.y1, s.y2) <= 0 &&
        Math.max(s.y1, s.y2) >= 10,
    )
    expect(shared).toHaveLength(1)
  })
})

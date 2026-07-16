import { describe, expect, it } from 'vitest'
import {
  CAR_BODY_BREAKPOINTS,
  defaultFgBreakpoints,
  equidistantX,
  FG_KNOB_COUNT,
  functionGeneratorOutput,
  setEquidistantY,
  toEquidistantBreakpoints,
} from './functionGenerator'
import { createEmptyMachine, setFgBreakpoint } from './circuit'
import { MACHINE_UNIT } from './types'

describe('function generator', () => {
  it('interpolates car body silhouette', () => {
    const mid = functionGeneratorOutput(0, CAR_BODY_BREAKPOINTS)
    expect(mid).toBeGreaterThan(1.2)
    const nose = functionGeneratorOutput(-1, CAR_BODY_BREAKPOINTS)
    expect(nose).toBeLessThan(0.5)
  })

  it('exposes 21 equidistant abscissae from −10 to +10', () => {
    expect(FG_KNOB_COUNT).toBe(21)
    expect(equidistantX(0)).toBeCloseTo(-MACHINE_UNIT, 10)
    expect(equidistantX(10)).toBeCloseTo(0, 10)
    expect(equidistantX(20)).toBeCloseTo(MACHINE_UNIT, 10)
  })

  it('default breakpoints are identity f(x)=x', () => {
    const pts = defaultFgBreakpoints()
    expect(pts).toHaveLength(21)
    expect(functionGeneratorOutput(5, pts)).toBeCloseTo(5, 5)
    expect(functionGeneratorOutput(-7, pts)).toBeCloseTo(-7, 5)
  })

  it('setEquidistantY clamps and preserves other knots', () => {
    const pts = setEquidistantY(defaultFgBreakpoints(), 10, 4)
    expect(pts[10]!.y).toBe(4)
    expect(pts[0]!.y).toBeCloseTo(-10, 5)
    expect(pts[20]!.y).toBeCloseTo(10, 5)
    const clamped = setEquidistantY(pts, 10, 99)
    expect(clamped[10]!.y).toBe(MACHINE_UNIT)
  })

  it('resamples arbitrary curves onto the museum grid', () => {
    const grid = toEquidistantBreakpoints(CAR_BODY_BREAKPOINTS)
    expect(grid).toHaveLength(21)
    expect(grid[0]!.x).toBeCloseTo(-10, 5)
    // Outside the car-body domain the ends hold
    expect(grid[0]!.y).toBeCloseTo(CAR_BODY_BREAKPOINTS[0]!.y, 5)
  })

  it('setFgBreakpoint updates F1 on the machine', () => {
    let m = createEmptyMachine()
    const fg1 = m.nodes.find((n) => n.id === 'fg_1')
    expect(fg1?.kind).toBe('functionGenerator')
    m = setFgBreakpoint(m, 'fg_1', 10, -3)
    const next = m.nodes.find((n) => n.id === 'fg_1')
    expect(next?.breakpoints?.[10]?.y).toBe(-3)
  })
})

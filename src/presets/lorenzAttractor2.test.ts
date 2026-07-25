import { describe, expect, it } from 'vitest'
import { loadLorenzAttractor2, lorenzAttractor2Snapshot } from './lorenzAttractor2'
import { setMode, stepMachine } from '../engine/circuit'
import { countMultipliers, countPots } from '../engine/elements'
import { MAX_MULTIPLIERS, OVERLOAD_THRESHOLD, portKey } from '../engine/types'
import { LORENZ2_SCOPE_CHANNELS } from '../scope/channels'
import { buildPatchLayout, findPortCell } from '../ui/patchLayout'

const V = (m: ReturnType<typeof loadLorenzAttractor2>, id: string) =>
  m.lastEval.voltages[portKey({ nodeId: id, port: 'out' })] ?? NaN

describe('lorenz attractor 2 preset', () => {
  it('uses exactly four pots and two multipliers', () => {
    const m = loadLorenzAttractor2()
    expect(countPots(m.nodes)).toBe(4)
    expect(countMultipliers(m.nodes)).toBe(2)
    expect(countMultipliers(m.nodes)).toBeLessThanOrEqual(MAX_MULTIPLIERS)
    expect(m.nodes.find((n) => n.id === 'pot_ydamp')?.coefficient).toBeCloseTo(
      0.1,
      6,
    )
  })

  it('holds the classic (1,1,1) initial condition in IC mode (S = 10)', () => {
    let m = loadLorenzAttractor2()
    m = setMode(m, 'ic')
    expect(V(m, 'lorenz2_x')).toBeCloseTo(0.1, 6)
    expect(V(m, 'lorenz2_y')).toBeCloseTo(0.1, 6)
    expect(V(m, 'lorenz2_z')).toBeCloseTo(0.1, 6)
  })

  it('reproduces the scaled Lorenz derivatives at the initial condition', () => {
    let m = loadLorenzAttractor2()
    m = setMode(m, 'operate')
    const d = m.lastEval.derivatives
    // Physical ẋ=0, ẏ=26, ż=−5/3 at (1,1,1); scaled by 1/10.
    expect(d['lorenz2_x']).toBeCloseTo(0, 4)
    expect(d['lorenz2_y']).toBeCloseTo(2.6, 3)
    expect(d['lorenz2_z']).toBeCloseTo(-5 / 3 / 10, 3)
  })

  it('stays on a bounded attractor without overloading', () => {
    let m = loadLorenzAttractor2()
    m = setMode(m, 'ic')
    m = setMode(m, 'operate')
    let maxAbs = 0
    let overloads = 0
    const xs: number[] = []
    const dt = 0.004
    for (let i = 0; i < 5000; i++) {
      m = stepMachine(m, dt, { stepsPerFrame: 2 })
      for (const id of ['lorenz2_x', 'lorenz2_y', 'lorenz2_z']) {
        maxAbs = Math.max(maxAbs, Math.abs(V(m, id)))
      }
      overloads += m.lastEval.overloaded.size
      if (i % 250 === 0) xs.push(V(m, 'lorenz2_x'))
    }
    expect(Number.isFinite(maxAbs)).toBe(true)
    expect(maxAbs).toBeLessThan(OVERLOAD_THRESHOLD)
    expect(maxAbs).toBeGreaterThan(1)
    expect(overloads).toBe(0)
    expect(Math.max(...xs)).toBeGreaterThan(0.5)
    expect(Math.min(...xs)).toBeLessThan(-0.5)
  }, 20_000)

  it('exposes an x–z butterfly scope channel', () => {
    const snap = lorenzAttractor2Snapshot()
    const ids = new Set(snap.nodes.map((n) => n.id))
    expect(ids.has('lorenz2_x')).toBe(true)
    expect(ids.has('lorenz2_z')).toBe(true)
    expect(LORENZ2_SCOPE_CHANNELS[0]?.xNode).toBe('lorenz2_x')
    expect(LORENZ2_SCOPE_CHANNELS[0]?.yNode).toBe('lorenz2_z')
  })

  it('sets ∫ + time×10 jumpers on the three integrator amp slots', () => {
    const snap = lorenzAttractor2Snapshot()
    for (const slot of [0, 1, 4]) {
      const mode = snap.jumpers?.find(
        (j) => j.ampSlot === slot && j.kind === 'mode4',
      )
      const time = snap.jumpers?.find(
        (j) => j.ampSlot === slot && j.kind === 'time2',
      )
      expect(mode?.position).toBe('integral')
      expect(time?.position).toBe('10')
    }
  })

  it('maps every cable endpoint onto the faceplate', () => {
    const m = loadLorenzAttractor2()
    const cells = buildPatchLayout(m.nodes)
    const missing = m.cables.filter(
      (c) => !findPortCell(cells, c.from) || !findPortCell(cells, c.to),
    )
    expect(missing).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  LORENZ_SCOPE_CHANNELS,
  loadLorenzAttractor,
  lorenzAttractorSnapshot,
} from './lorenzAttractor'
import { setMode, stepMachine } from '../engine/circuit'
import { countMultipliers } from '../engine/elements'
import { MAX_MULTIPLIERS, OVERLOAD_THRESHOLD, portKey } from '../engine/types'

const V = (m: ReturnType<typeof loadLorenzAttractor>, id: string) =>
  m.lastEval.voltages[portKey({ nodeId: id, port: 'out' })] ?? NaN

describe('lorenz attractor preset', () => {
  it('holds the classic (1,1,1) initial condition in IC mode (scaled)', () => {
    let m = loadLorenzAttractor()
    m = setMode(m, 'ic')
    // Scaled ICs: vX = 1/2.5, vY = 1/3.5, vZ = 1/6.
    expect(V(m, 'lorenz_x')).toBeCloseTo(1 / 2.5, 6)
    expect(V(m, 'lorenz_y')).toBeCloseTo(1 / 3.5, 6)
    expect(V(m, 'lorenz_z')).toBeCloseTo(1 / 6, 6)
  })

  it('uses no more than the available multipliers', () => {
    const m = loadLorenzAttractor()
    expect(countMultipliers(m.nodes)).toBe(2)
    expect(countMultipliers(m.nodes)).toBeLessThanOrEqual(MAX_MULTIPLIERS)
  })

  it('reproduces the scaled Lorenz derivatives at the initial condition', () => {
    let m = loadLorenzAttractor()
    m = setMode(m, 'operate')
    const d = m.lastEval.derivatives
    // Physical ẋ=σ(y−x)=0, ẏ=ρx−xz−y=26, ż=xy−βz=−5/3 at (1,1,1);
    // scaled by 1/Sx, 1/Sy, 1/Sz.
    expect(d['lorenz_x']).toBeCloseTo(0, 4)
    expect(d['lorenz_y']).toBeCloseTo(26 / 3.5, 3)
    expect(d['lorenz_z']).toBeCloseTo(-5 / 3 / 6, 3)
  })

  it('stays on a bounded attractor without overloading', () => {
    let m = loadLorenzAttractor()
    m = setMode(m, 'ic')
    m = setMode(m, 'operate')
    let maxAbs = 0
    let overloads = 0
    const xs: number[] = []
    const dt = 0.004
    for (let i = 0; i < 5000; i++) {
      m = stepMachine(m, dt, { stepsPerFrame: 2 })
      for (const id of ['lorenz_x', 'lorenz_y', 'lorenz_z']) {
        maxAbs = Math.max(maxAbs, Math.abs(V(m, id)))
      }
      overloads += m.lastEval.overloaded.size
      if (i % 250 === 0) xs.push(V(m, 'lorenz_x'))
    }
    // Bounded within the machine unit and never trips overload.
    expect(Number.isFinite(maxAbs)).toBe(true)
    expect(maxAbs).toBeLessThan(OVERLOAD_THRESHOLD)
    expect(maxAbs).toBeGreaterThan(3)
    expect(overloads).toBe(0)

    // Chaotic wander: x visits both wings (clearly positive and negative).
    expect(Math.max(...xs)).toBeGreaterThan(1.5)
    expect(Math.min(...xs)).toBeLessThan(-1.5)
  }, 20_000)

  it('exposes an x–z butterfly scope channel', () => {
    const snap = lorenzAttractorSnapshot()
    const ids = new Set(snap.nodes.map((n) => n.id))
    expect(ids.has('lorenz_x')).toBe(true)
    expect(ids.has('lorenz_z')).toBe(true)
    expect(LORENZ_SCOPE_CHANNELS[0]?.xNode).toBe('lorenz_x')
    expect(LORENZ_SCOPE_CHANNELS[0]?.yNode).toBe('lorenz_z')
  })
})

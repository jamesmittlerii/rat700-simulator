import { describe, expect, it } from 'vitest'
import { setMode, stepMachine, type MachineState } from '../engine/circuit'
import { countMultipliers } from '../engine/elements'
import { OVERLOAD_THRESHOLD, portKey } from '../engine/types'
import {
  loadRosslerAttractor,
  ROSSLER_SCOPE_CHANNELS,
} from './rosslerAttractor'
import { loadVanDerPol, VAN_DER_POL_SCOPE_CHANNELS } from './vanDerPol'
import { loadMathieuEquation, MATHIEU_SCOPE_CHANNELS } from './mathieuEquation'
import {
  loadDuffingOscillator,
  DUFFING_SCOPE_CHANNELS,
} from './duffingOscillator'

interface Trace {
  min: Record<string, number>
  max: Record<string, number>
  overloads: number
  signChanges: Record<string, number>
}

function simulate(
  load: () => MachineState,
  ids: string[],
  steps = 9000,
  dt = 0.004,
): Trace {
  let m = load()
  // Drive machine time directly (timeScale is only a wall→machine display knob).
  m = { ...m, timeScale: 1 }
  m = setMode(m, 'ic')
  m = setMode(m, 'operate')
  const V = (id: string) =>
    m.lastEval.voltages[portKey({ nodeId: id, port: 'out' })] ?? NaN
  const min: Record<string, number> = {}
  const max: Record<string, number> = {}
  const signChanges: Record<string, number> = {}
  const lastSign: Record<string, number> = {}
  for (const id of ids) {
    min[id] = Infinity
    max[id] = -Infinity
    signChanges[id] = 0
    lastSign[id] = 0
  }
  let overloads = 0
  for (let i = 0; i < steps; i++) {
    m = stepMachine(m, dt, { stepsPerFrame: 2 })
    overloads += m.lastEval.overloaded.size
    for (const id of ids) {
      const v = V(id)
      min[id] = Math.min(min[id]!, v)
      max[id] = Math.max(max[id]!, v)
      const s = Math.sign(v)
      if (s !== 0 && lastSign[id] !== 0 && s !== lastSign[id]) {
        signChanges[id]!++
      }
      if (s !== 0) lastSign[id] = s
    }
  }
  return { min, max, overloads, signChanges }
}

describe('Rössler attractor preset', () => {
  it('uses a single multiplier', () => {
    expect(countMultipliers(loadRosslerAttractor().nodes)).toBe(1)
  })

  it('stays bounded, folds in z, and never overloads', () => {
    const t = simulate(loadRosslerAttractor, ['ross_x', 'ross_y', 'ross_z'])
    const maxAbs = Math.max(
      Math.abs(t.min['ross_x']!), Math.abs(t.max['ross_x']!),
      Math.abs(t.min['ross_y']!), Math.abs(t.max['ross_y']!),
      Math.abs(t.min['ross_z']!), Math.abs(t.max['ross_z']!),
    )
    expect(Number.isFinite(maxAbs)).toBe(true)
    expect(maxAbs).toBeLessThan(OVERLOAD_THRESHOLD)
    expect(t.overloads).toBe(0)
    // Spiral: x swings both ways; z lifts on the fold.
    expect(t.signChanges['ross_x']!).toBeGreaterThan(5)
    expect(t.max['ross_z']!).toBeGreaterThan(1)
  }, 20_000)

  it('exposes an x–y scope channel', () => {
    expect(ROSSLER_SCOPE_CHANNELS[0]?.xNode).toBe('ross_x')
    expect(ROSSLER_SCOPE_CHANNELS[0]?.yNode).toBe('ross_y')
  })
})

describe('Van der Pol oscillator preset', () => {
  it('uses two multipliers', () => {
    expect(countMultipliers(loadVanDerPol().nodes)).toBe(2)
  })

  it('converges to a bounded limit cycle', () => {
    const t = simulate(loadVanDerPol, ['vdp_x', 'vdp_v'])
    expect(t.overloads).toBe(0)
    // Limit-cycle amplitude for μ=2 is ≈ 2 V; from IC 0.3 it grows to it.
    expect(t.max['vdp_x']!).toBeGreaterThan(1.5)
    expect(t.max['vdp_x']!).toBeLessThan(3)
    expect(t.min['vdp_x']!).toBeLessThan(-1.5)
    // Sustained oscillation → many sign crossings.
    expect(t.signChanges['vdp_x']!).toBeGreaterThan(5)
  }, 20_000)

  it('exposes an x–ẋ scope channel', () => {
    expect(VAN_DER_POL_SCOPE_CHANNELS[0]?.xNode).toBe('vdp_x')
    expect(VAN_DER_POL_SCOPE_CHANNELS[0]?.yNode).toBe('vdp_v')
  })
})

describe('Mathieu equation preset', () => {
  it('stays bounded (stable zone) and oscillates', () => {
    const t = simulate(loadMathieuEquation, ['mathieu_x', 'mathieu_v'])
    const maxAbs = Math.max(
      Math.abs(t.min['mathieu_x']!), Math.abs(t.max['mathieu_x']!),
    )
    expect(t.overloads).toBe(0)
    expect(maxAbs).toBeLessThan(OVERLOAD_THRESHOLD)
    expect(t.signChanges['mathieu_x']!).toBeGreaterThan(5)
  }, 20_000)

  it('exposes an x–ẋ scope channel', () => {
    expect(MATHIEU_SCOPE_CHANNELS[0]?.xNode).toBe('mathieu_x')
    expect(MATHIEU_SCOPE_CHANNELS[0]?.yNode).toBe('mathieu_v')
  })
})

describe('Duffing oscillator preset', () => {
  it('uses two multipliers', () => {
    expect(countMultipliers(loadDuffingOscillator().nodes)).toBe(2)
  })

  it('snaps between both wells and stays bounded', () => {
    const t = simulate(loadDuffingOscillator, ['duffing_x', 'duffing_v'])
    const maxAbs = Math.max(
      Math.abs(t.min['duffing_x']!), Math.abs(t.max['duffing_x']!),
      Math.abs(t.min['duffing_v']!), Math.abs(t.max['duffing_v']!),
    )
    expect(t.overloads).toBe(0)
    expect(maxAbs).toBeLessThan(OVERLOAD_THRESHOLD)
    // Cross-well: visits both the +x and −x wells (|x| > ~0.7·S, S=4).
    expect(t.max['duffing_x']!).toBeGreaterThan(2.8)
    expect(t.min['duffing_x']!).toBeLessThan(-2.8)
  }, 20_000)

  it('exposes an x–ẋ scope channel', () => {
    expect(DUFFING_SCOPE_CHANNELS[0]?.xNode).toBe('duffing_x')
    expect(DUFFING_SCOPE_CHANNELS[0]?.yNode).toBe('duffing_v')
  })
})

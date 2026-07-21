import { describe, expect, it } from 'vitest'
import { setMode, stepMachine, type MachineState } from '../engine/circuit'
import { countMultipliers } from '../engine/elements'
import { MAX_FUNCTION_GENERATORS, OVERLOAD_THRESHOLD, portKey } from '../engine/types'
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
import {
  loadSoftSpringThreeBody,
  SOFT_SPRING_SCOPE_CHANNELS,
} from './softSpringThreeBody'
import {
  chuaDiode,
  CHUA_SCOPE_CHANNELS,
  loadChuaCircuit,
} from './chuaCircuit'

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

describe('Soft-spring three-body preset', () => {
  it('uses four multipliers (xA³ and yA³)', () => {
    expect(countMultipliers(loadSoftSpringThreeBody().nodes)).toBe(4)
  })

  it('keeps both bodies bounded and oscillating without overload', () => {
    const t = simulate(
      loadSoftSpringThreeBody,
      ['ss3_xA', 'ss3_yA', 'ss3_xB', 'ss3_yB'],
      12_000,
      0.004,
    )
    const maxAbs = Math.max(
      Math.abs(t.min['ss3_xA']!),
      Math.abs(t.max['ss3_xA']!),
      Math.abs(t.min['ss3_yA']!),
      Math.abs(t.max['ss3_yA']!),
      Math.abs(t.min['ss3_xB']!),
      Math.abs(t.max['ss3_xB']!),
      Math.abs(t.min['ss3_yB']!),
      Math.abs(t.max['ss3_yB']!),
    )
    expect(t.overloads).toBe(0)
    expect(maxAbs).toBeLessThan(OVERLOAD_THRESHOLD)
    // Sustained planar motion on A (the scoped body).
    expect(t.signChanges['ss3_xA']!).toBeGreaterThan(5)
    expect(t.signChanges['ss3_yA']!).toBeGreaterThan(5)
    expect(t.max['ss3_xA']!).toBeGreaterThan(1)
    expect(t.min['ss3_xA']!).toBeLessThan(-1)
  }, 20_000)

  it('exposes an xA–yA scope channel', () => {
    expect(SOFT_SPRING_SCOPE_CHANNELS[0]?.xNode).toBe('ss3_xA')
    expect(SOFT_SPRING_SCOPE_CHANNELS[0]?.yNode).toBe('ss3_yA')
  })
})

describe('Chua’s circuit preset', () => {
  it('uses one function generator and no multipliers', () => {
    const m = loadChuaCircuit()
    const fgs = m.nodes.filter((n) => n.kind === 'functionGenerator')
    // fromSnapshot fills empty F2, so two FG nodes exist; only F1 is patched.
    expect(fgs.some((n) => n.id === 'fg_1')).toBe(true)
    expect(fgs.length).toBeLessThanOrEqual(MAX_FUNCTION_GENERATORS)
    expect(countMultipliers(m.nodes)).toBe(0)
  })

  it('programs F1 as the Chua diode g(Sx·v)', () => {
    const m = loadChuaCircuit()
    const fg = m.nodes.find((n) => n.id === 'fg_1')
    expect(fg?.breakpoints?.length).toBeGreaterThan(2)
    // Inner slope ≈ m0·Sx = −1.143·0.5 at small v; outer at v=4 → x=2.
    const pts = fg!.breakpoints!
    const near0 = pts.find((p) => Math.abs(p.x) < 0.01)
    expect(near0?.y).toBeCloseTo(0, 5)
    const at2 = pts.find((p) => Math.abs(p.x - 2) < 0.01)
    expect(at2?.y).toBeCloseTo(chuaDiode(1), 5)
  })

  it('matches scaled Chua derivatives at the initial condition', () => {
    let m = loadChuaCircuit()
    m = setMode(m, 'operate')
    const d = m.lastEval.derivatives
    // Physical (0.1,0.1,0.1): ẋ=α(−g)=α·0.1143, ẏ=0.1, ż=−β·0.1
    // Scaled by 1/Sx, 1/Sy, 1/Sz with Sx=Sz=0.5, Sy=0.05.
    const g = chuaDiode(0.1)
    expect(d['chua_x']).toBeCloseTo((15.6 * -g) / 0.5, 3)
    expect(d['chua_y']).toBeCloseTo(0.1 / 0.05, 3)
    expect(d['chua_z']).toBeCloseTo((-28 * 0.1) / 0.5, 3)
  })

  it('stays on a bounded double-scroll without overloading', () => {
    const t = simulate(
      loadChuaCircuit,
      ['chua_x', 'chua_y', 'chua_z'],
      12_000,
      0.004,
    )
    const maxAbs = Math.max(
      Math.abs(t.min['chua_x']!),
      Math.abs(t.max['chua_x']!),
      Math.abs(t.min['chua_y']!),
      Math.abs(t.max['chua_y']!),
      Math.abs(t.min['chua_z']!),
      Math.abs(t.max['chua_z']!),
    )
    expect(Number.isFinite(maxAbs)).toBe(true)
    expect(maxAbs).toBeLessThan(OVERLOAD_THRESHOLD)
    expect(t.overloads).toBe(0)
    // Double-scroll: x visits both lobes.
    expect(t.max['chua_x']!).toBeGreaterThan(2)
    expect(t.min['chua_x']!).toBeLessThan(-2)
    expect(t.signChanges['chua_x']!).toBeGreaterThan(5)
  }, 20_000)

  it('exposes an x–y scope channel', () => {
    expect(CHUA_SCOPE_CHANNELS[0]?.xNode).toBe('chua_x')
    expect(CHUA_SCOPE_CHANNELS[0]?.yNode).toBe('chua_y')
  })
})

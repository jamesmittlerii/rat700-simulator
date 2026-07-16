import { describe, expect, it } from 'vitest'
import {
  inverterOutput,
  potOutput,
  summerOutput,
  integratorDerivative,
  signalOutput,
  multiplierOutput,
  createNode,
} from './elements'
import { evaluateAlgebraic, rk4Step } from './solver'
import { loadHarmonicOscillator } from '../presets/harmonicOscillator'
import { loadVehicleSuspension } from '../presets/vehicleSuspension'
import { stepMachine, setMode, setTimeFactor } from './circuit'
import { MACHINE_UNIT, OVERLOAD_THRESHOLD, portKey } from './types'
import { ampConfigFromJumpers, defaultJumpers, upsertJumper } from './jumpers'

describe('element math', () => {
  it('potentiometer scales input by k', () => {
    expect(potOutput(10, 0.5)).toBe(5)
    expect(potOutput(10, 0)).toBe(0)
    expect(potOutput(10, 1.5)).toBe(10)
  })

  it('summer inverts the weighted sum', () => {
    expect(summerOutput([1, 2], [1, 1])).toBe(-3)
    expect(summerOutput([1], [10])).toBe(-10)
  })

  it('integrator derivative matches summer at timeFactor 1', () => {
    expect(integratorDerivative([2, 0], [1, 1])).toBe(-2)
  })

  it('integrator timeFactor scales the derivative', () => {
    expect(integratorDerivative([2, 0], [1, 1], 1)).toBe(-2)
    expect(integratorDerivative([2, 0], [1, 1], 10)).toBe(-20)
    expect(integratorDerivative([2, 0], [1, 1], 100)).toBe(-200)
  })

  it('inverter negates', () => {
    expect(inverterOutput(7)).toBe(-7)
  })

  it('multiplier product is −(x·y)/E', () => {
    expect(multiplierOutput(10, 10)).toBeCloseTo(-10, 10)
    expect(multiplierOutput(5, 4)).toBeCloseTo(-2, 10)
    expect(multiplierOutput(-10, 5)).toBeCloseTo(5, 10)
  })

  it('road noise stays within amplitude envelope', () => {
    const a = 2
    for (let t = 0; t < 20; t += 0.05) {
      expect(Math.abs(signalOutput(t, 'road', a, 2))).toBeLessThanOrEqual(
        a * 1.15,
      )
    }
  })

  it('road noise is continuous in time (RK4-safe)', () => {
    const t = 1.234
    const dt = 1e-4
    const a = signalOutput(t, 'road', 1, 3)
    const b = signalOutput(t + dt, 'road', 1, 3)
    expect(Math.abs(b - a)).toBeLessThan(0.05)
  })
})

describe('sign inversion under load', () => {
  it('summer output inverts a positive gain-10 input', () => {
    const nodes = [
      createNode('reference', 'ref', '+10', 0, 0, { voltage: 10 }),
      createNode('summer', 'sum', 'S', 0, 0, { inputGains: { in3: 10 } }),
    ]
    const cables = [
      {
        id: 'c1',
        from: { nodeId: 'ref', port: 'out' },
        to: { nodeId: 'sum', port: 'in3' },
      },
    ]
    const ev = evaluateAlgebraic(nodes, cables, {}, 'operate', 0)
    expect(ev.voltages[portKey({ nodeId: 'sum', port: 'out' })]).toBeCloseTo(
      -100,
      5,
    )
  })

  it('integrator derivative is negative of weighted inputs', () => {
    const nodes = [
      createNode('reference', 'ref', '+10', 0, 0, { voltage: 5 }),
      createNode('integrator', 'int', 'I', 0, 0, {
        state: 0,
        timeFactor: 1,
      }),
    ]
    const cables = [
      {
        id: 'c1',
        from: { nodeId: 'ref', port: 'out' },
        to: { nodeId: 'int', port: 'in0' },
      },
    ]
    const ev = evaluateAlgebraic(nodes, cables, { int: 0 }, 'operate', 0)
    expect(ev.derivatives['int']).toBeCloseTo(-5, 5)
  })
})

describe('jumper amp config', () => {
  it('default jumpers yield summer mode factor 1', () => {
    const cfg = ampConfigFromJumpers(0, defaultJumpers())
    expect(cfg.mode).toBe('summer')
    expect(cfg.timeFactor).toBe(1)
  })

  it('integral + time-10 jumpers configure integrator factor 10', () => {
    let j = defaultJumpers()
    j = upsertJumper(j, {
      id: 'jmode_0',
      kind: 'mode4',
      ampSlot: 0,
      position: 'integral',
    })
    j = upsertJumper(j, {
      id: 'jtime_0',
      kind: 'time2',
      ampSlot: 0,
      position: '10',
    })
    const cfg = ampConfigFromJumpers(0, j)
    expect(cfg.mode).toBe('integrator')
    expect(cfg.timeFactor).toBe(10)
  })

  it('setTimeFactor changes RK4 derivative scale', () => {
    let m = loadHarmonicOscillator()
    const before = evaluateAlgebraic(
      m.nodes,
      m.cables,
      m.states,
      'operate',
      0,
    ).derivatives['int_1']
    m = setTimeFactor(m, 'int_1', 10)
    const after = evaluateAlgebraic(
      m.nodes,
      m.cables,
      m.states,
      'operate',
      0,
    ).derivatives['int_1']
    expect(after).toBeCloseTo((before ?? 0) * 10, 5)
  })
})

describe('multiplier algebraic node', () => {
  it('tracks −(x·y)/E at machine unit', () => {
    const nodes = [
      createNode('reference', 'rx', 'X', 0, 0, { voltage: 8 }),
      createNode('reference', 'ry', 'Y', 0, 0, { voltage: 5 }),
      createNode('multiplier', 'mul', 'M', 0, 0),
    ]
    const cables = [
      {
        id: 'c1',
        from: { nodeId: 'rx', port: 'out' },
        to: { nodeId: 'mul', port: 'xp' },
      },
      {
        id: 'c2',
        from: { nodeId: 'ry', port: 'out' },
        to: { nodeId: 'mul', port: 'yp' },
      },
    ]
    const ev = evaluateAlgebraic(nodes, cables, {}, 'operate', 0)
    expect(ev.voltages[portKey({ nodeId: 'mul', port: 'out' })]).toBeCloseTo(
      -(8 * 5) / MACHINE_UNIT,
      8,
    )
  })
})

describe('overload trip', () => {
  it('marks nodes exceeding ±10.5 V', () => {
    const nodes = [
      createNode('reference', 'ref', '+10', 0, 0, { voltage: 10 }),
      createNode('summer', 'sum', 'S', 0, 0, {
        inputGains: { in0: 1, in1: 1 },
      }),
    ]
    const cables = [
      {
        id: 'c1',
        from: { nodeId: 'ref', port: 'out' },
        to: { nodeId: 'sum', port: 'in0' },
      },
      {
        id: 'c2',
        from: { nodeId: 'ref', port: 'out' },
        to: { nodeId: 'sum', port: 'in1' },
      },
    ]
    // out = −(10+10) = −20 > threshold
    const ev = evaluateAlgebraic(nodes, cables, {}, 'operate', 0)
    expect(Math.abs(ev.voltages[portKey({ nodeId: 'sum', port: 'out' })]!)).toBeGreaterThan(
      OVERLOAD_THRESHOLD,
    )
    expect(ev.overloaded.has('sum')).toBe(true)
  })

  it('autoShutdown forces Hold on overload during operate', () => {
    const nodes = [
      createNode('integrator', 'int', 'I', 0, 0, {
        state: 10.6,
        initialCondition: 10.6,
      }),
    ]
    let m = {
      nodes,
      cables: [] as const,
      mode: 'operate' as const,
      powered: true,
      timeScale: 1,
      time: 0,
      states: { int: 10.6 },
      lastEval: evaluateAlgebraic(nodes, [], { int: 10.6 }, 'operate', 0),
      idCounter: 1,
      jumpers: defaultJumpers(),
      panelButton: 'dauer' as const,
      masterRef: 0.5,
      calibratePotId: null,
      autoShutdown: true,
      stepsPerFrame: 1,
      externalSlave: false,
      einmalRemaining: null,
    }
    m = stepMachine(m, 0.01)
    expect(m.mode).toBe('hold')
    expect(m.panelButton).toBe('halt')
  })
})

describe('harmonic oscillator', () => {
  it('holds initial conditions in IC mode', () => {
    let m = loadHarmonicOscillator()
    m = setMode(m, 'ic')
    const x =
      m.lastEval.voltages[portKey({ nodeId: 'int_1', port: 'out' })] ?? 0
    const y =
      m.lastEval.voltages[portKey({ nodeId: 'int_2', port: 'out' })] ?? 0
    expect(x).toBeCloseTo(8, 5)
    expect(y).toBeCloseTo(0, 5)
  })

  it('produces roughly sinusoidal motion with stable amplitude', () => {
    let m = loadHarmonicOscillator()
    m = setMode(m, 'ic')
    m = setMode(m, 'operate')

    const samples: number[] = []
    const dt = 0.002
    const total = 2 * Math.PI
    for (let t = 0; t < total; t += dt) {
      m = stepMachine(m, dt)
      samples.push(
        m.lastEval.voltages[portKey({ nodeId: 'int_1', port: 'out' })] ?? 0,
      )
    }

    const finalX = samples[samples.length - 1]!
    expect(finalX).toBeCloseTo(8, 0)

    const max = Math.max(...samples.map(Math.abs))
    expect(max).toBeLessThan(10.5)
    expect(max).toBeGreaterThan(6)
  })

  it('RK4 quarter-period: x→0, y→±8 for ω=1', () => {
    let m = loadHarmonicOscillator()
    m = setMode(m, 'operate')
    let states = { ...m.states }
    const dt = 0.001
    const quarter = Math.PI / 2
    for (let t = 0; t < quarter; t += dt) {
      const r = rk4Step(m.nodes, m.cables, states, dt, 'operate', t)
      states = r.states
    }
    expect(states['int_1']).toBeCloseTo(0, 0)
    expect(Math.abs(states['int_2'] ?? 0)).toBeCloseTo(8, 0)
  })
})

function isComputingAmp(kind: string): boolean {
  return kind === 'integrator' || kind === 'summer' || kind === 'inverter'
}

describe('vehicle suspension', () => {
  it('fits within 15 faceplate computing amplifiers', () => {
    for (const damping of ['firm', 'soft'] as const) {
      const m = loadVehicleSuspension(damping)
      const computing = m.nodes.filter((n) => isComputingAmp(n.kind))
      expect(computing.length).toBe(15)
      expect(computing.every((n) => n.ampSlot != null && n.ampSlot < 15)).toBe(
        true,
      )
      // Body FG on F1; empty F2 is auto-filled by fromSnapshot
      expect(m.nodes.some((n) => n.id === 'fg_1')).toBe(true)
      expect(
        computing.every(
          (n) =>
            n.kind === 'integrator' ||
            n.kind === 'summer' ||
            n.kind === 'inverter',
        ),
      ).toBe(true)
    }
  })

  it('exposes analog X/Y figure voltages', () => {
    let m = loadVehicleSuspension('firm')
    m = setMode(m, 'operate')
    for (let i = 0; i < 200; i++) {
      m = stepMachine(m, 0.002)
    }
    const xL =
      m.lastEval.voltages[portKey({ nodeId: 'sum_xL', port: 'out' })] ?? NaN
    const yw =
      m.lastEval.voltages[portKey({ nodeId: 'sum_yw', port: 'out' })] ?? NaN
    const fg =
      m.lastEval.voltages[portKey({ nodeId: 'fg_1', port: 'out' })] ?? NaN
    const y1 =
      m.lastEval.voltages[portKey({ nodeId: 'int_y1', port: 'out' })] ?? NaN
    expect(Number.isFinite(xL)).toBe(true)
    expect(Number.isFinite(yw)).toBe(true)
    expect(Number.isFinite(fg)).toBe(true)
    expect(Number.isFinite(y1)).toBe(true)
  })

  it('responds to road input without immediate overload', () => {
    let m = loadVehicleSuspension('firm')
    m = setMode(m, 'operate')
    for (let i = 0; i < 500; i++) {
      m = stepMachine(m, 0.002)
    }
    const y1 =
      m.lastEval.voltages[portKey({ nodeId: 'int_y1', port: 'out' })] ?? 0
    const y2 =
      m.lastEval.voltages[portKey({ nodeId: 'int_y2', port: 'out' })] ?? 0
    expect(Number.isFinite(y1)).toBe(true)
    expect(Number.isFinite(y2)).toBe(true)
    expect(Math.abs(y1)).toBeLessThan(10.5)
    expect(Math.abs(y2)).toBeLessThan(10.5)
    expect(Math.abs(y1) + Math.abs(y2)).toBeGreaterThan(0.05)
  })

  it('soft damping preset uses lower damper pots than firm', () => {
    const firm = loadVehicleSuspension('firm')
    const soft = loadVehicleSuspension('soft')
    const firmB = firm.nodes.find((n) => n.id === 'pot_beta')?.coefficient ?? 1
    const softB = soft.nodes.find((n) => n.id === 'pot_beta')?.coefficient ?? 1
    expect(softB).toBeLessThan(firmB * 0.5)
  })

  it(
    'free response decays with firm damping',
    () => {
      let m = loadVehicleSuspension('firm')
      m = {
        ...m,
        autoShutdown: false,
        stepsPerFrame: 1,
        nodes: m.nodes.map((n) =>
          n.id === 'road' ? { ...n, amplitude: 0 } : n,
        ),
        states: { ...m.states, int_y1: 4, int_v1: 0, int_y2: 0, int_v2: 0 },
      }
      m = {
        ...m,
        nodes: m.nodes.map((n) =>
          n.id === 'int_y1' ? { ...n, state: 4, initialCondition: 4 } : n,
        ),
      }
      m = setMode(m, 'operate')
      for (let i = 0; i < 2000; i++) {
        m = stepMachine(m, 0.004, { stepsPerFrame: 1 })
      }
      const y1 =
        m.lastEval.voltages[portKey({ nodeId: 'int_y1', port: 'out' })] ?? 0
      expect(Math.abs(y1)).toBeLessThan(3.5)
    },
    15_000,
  )
})

describe('algebraic evaluation', () => {
  it('detects algebraic loops', () => {
    const nodes = [
      {
        id: 'a',
        kind: 'inverter' as const,
        label: 'A',
        x: 0,
        y: 0,
      },
      {
        id: 'b',
        kind: 'inverter' as const,
        label: 'B',
        x: 0,
        y: 0,
      },
    ]
    const cables = [
      {
        id: 'c1',
        from: { nodeId: 'a', port: 'out' },
        to: { nodeId: 'b', port: 'in' },
      },
      {
        id: 'c2',
        from: { nodeId: 'b', port: 'out' },
        to: { nodeId: 'a', port: 'in' },
      },
    ]
    const ev = evaluateAlgebraic(nodes, cables, {}, 'operate', 0)
    expect(ev.warning).toMatch(/algebraic/i)
  })
})

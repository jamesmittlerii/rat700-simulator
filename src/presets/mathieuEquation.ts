import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import type { Cable, CircuitNode, CircuitSnapshot } from '../engine/types'

/**
 * Mathieu equation — the parametric pendulum / playground swing.
 *
 *   ẍ + [a − 2q·cos(2τ)]·x = 0   ⇒   ẍ = −a·x + 2q·cos(2τ)·x
 *
 * The time-varying coefficient makes this parametric: a sine signal generator
 * supplies the 2τ modulation and a multiplier forms cos(2τ)·x.
 *
 * Equation time τ runs 10× faster than machine time so the phase portrait
 * traces briskly without needing a high wall-clock timeScale: both integrators
 * use timeFactor 10 and the drive is ω = 20 rad/s (≡ 2 rad per unit τ).
 * Parameters (a, q) sit in a stable band, so (x vs ẋ) draws bounded,
 * precessing orbital rings.
 */

const A = 0.6
const Q = 0.2

/** Equation-time speedup vs machine time (integrators + drive). */
const TF = 10
/** Drive ω in machine rad/s; equals 2·TF so cos(ω t) = cos(2τ). */
const DRIVE_OMEGA = 2 * TF

const IC_X = 3
const IC_V = 0

export function mathieuEquationSnapshot(): CircuitSnapshot {
  const nodes: CircuitNode[] = [
    createNode('reference', 'ref_p10', '+10 V', 40, 40, { voltage: 10 }),
    createNode('reference', 'ref_m10', '−10 V', 40, 120, { voltage: -10 }),
    createNode('reference', 'ref_gnd', 'Ground', 40, 200, { voltage: 0 }),

    createNode('signal', 'drive', 'cos(2τ)', 40, 300, {
      waveform: 'sine',
      amplitude: 1,
      frequency: DRIVE_OMEGA,
    }),

    createNode('integrator', 'mathieu_x', 'Int x', 360, 80, {
      initialCondition: IC_X,
      state: IC_X,
      timeFactor: TF,
    }),
    createNode('integrator', 'mathieu_v', 'Int v = ẋ', 360, 260, {
      initialCondition: IC_V,
      state: IC_V,
      timeFactor: TF,
    }),

    createNode('inverter', 'inv_v', '−v', 600, 80),
    createNode('multiplier', 'mult_p', 'cos·x', 160, 300),

    // v̇ = −a·x + 2q·cos(2τ)·x
    createNode('potentiometer', 'pot_a', 'a (x→v)', 520, 240, {
      coefficient: A,
    }),
    // On a ×10 input, effective coeff = 10·k; want 2q·(−10·M)=+2q·cos·x, so k=2q.
    createNode('potentiometer', 'pot_q', '2q (cos·x→v)', 520, 300, {
      coefficient: 2 * Q,
    }),
  ]

  const cables: Cable[] = [
    // ẋ = v : feed −v into the inverting x integrator (gain 1, direct)
    c(1, 'mathieu_v', 'out', 'inv_v', 'in'),
    c(2, 'inv_v', 'out', 'mathieu_x', 'in0'),

    // cos(2τ)·x product (out = −(cos·x)/10)
    c(3, 'drive', 'out', 'mult_p', 'xp'),
    c(4, 'mathieu_x', 'out', 'mult_p', 'yp'),

    // v̇ = −a·x  (positive source x → inverting integrator gives −a·x)
    c(5, 'mathieu_x', 'out', 'pot_a', 'in'),
    c(6, 'pot_a', 'out', 'mathieu_v', 'in0'),
    // v̇ += 2q·cos(2τ)·x  (from the product on a ×10 input)
    c(7, 'mult_p', 'out', 'pot_q', 'in'),
    c(8, 'pot_q', 'out', 'mathieu_v', 'in3'),
  ]

  return {
    nodes,
    cables,
    mode: 'ic',
    powered: true,
    timeScale: 2,
    time: 0,
    panelButton: 'pause',
  }
}

function c(
  n: number,
  fromId: string,
  fromPort: string,
  toId: string,
  toPort: string,
): Cable {
  return {
    id: `cable_${n}`,
    from: { nodeId: fromId, port: fromPort },
    to: { nodeId: toId, port: toPort },
  }
}

export function loadMathieuEquation() {
  return fromSnapshot(mathieuEquationSnapshot())
}

export const MATHIEU_NODES = { x: 'mathieu_x', v: 'mathieu_v' } as const

/** X/Y scope: position vs velocity phase portrait. */
export const MATHIEU_SCOPE_CHANNELS = [
  {
    id: 'mathieuPhase',
    label: 'Mathieu · x–ẋ',
    title: 'X/Y scope — Mathieu parametric rings (x vs ẋ)',
    xNode: 'mathieu_x',
    yNode: 'mathieu_v',
    xScale: 1.8,
    yScale: 2.2,
    // At 1×; scope scales by timeScale (preset default 2× → 10 s trail).
    persistSec: 5,
  },
] as const

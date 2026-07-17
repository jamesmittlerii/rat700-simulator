import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import type { Cable, CircuitNode, CircuitSnapshot } from '../engine/types'

/**
 * Van der Pol oscillator — non-linear damping that converges to a limit cycle.
 *
 *   ẍ − μ(1 − x²)ẋ + x = 0   ⇒   ẍ = μ(1 − x²)ẋ − x
 *
 * State (x, v = ẋ) in volts (limit-cycle amplitude ≈ 2 V; the scope scales up
 * for display). Integrators run at timeFactor 10 so the μ gain fits.
 *
 * Realisation:
 *   - M1 forms x² (out = −x²/10); a summer builds u = 1 − x².
 *   - M2 forms u·x2 (out = −(u·x2)/10) so μ(1−x²)ẋ = −10μ·M2.
 *   - Two inverters supply −x²/10 (for the u summer) and −v (for ẋ = v).
 */

const MU = 2
const TF = 10

const IC_X = 0.3
const IC_V = 0

export function vanDerPolSnapshot(): CircuitSnapshot {
  const nodes: CircuitNode[] = [
    createNode('reference', 'ref_p10', '+10 V', 40, 40, { voltage: 10 }),
    createNode('reference', 'ref_m10', '−10 V', 40, 120, { voltage: -10 }),
    createNode('reference', 'ref_gnd', 'Ground', 40, 200, { voltage: 0 }),

    createNode('integrator', 'vdp_x', 'Int x', 360, 80, {
      initialCondition: IC_X,
      state: IC_X,
      timeFactor: TF,
    }),
    createNode('integrator', 'vdp_v', 'Int v = ẋ', 360, 260, {
      initialCondition: IC_V,
      state: IC_V,
      timeFactor: TF,
    }),

    createNode('multiplier', 'mult_x2', 'x²', 160, 440),
    createNode('multiplier', 'mult_uv', '(1−x²)·v', 620, 440),
    createNode('inverter', 'inv_x2', '+x²/10', 380, 440),
    createNode('inverter', 'inv_v', '−v', 600, 60),
    createNode('summer', 'sum_u', '1 − x²', 500, 440),

    createNode('potentiometer', 'pot_one', '−1 const', 340, 520, {
      coefficient: 0.1,
    }),
    createNode('potentiometer', 'pot_dx', '1/TF (v→x)', 240, 120, {
      coefficient: 0.1,
    }),
    createNode('potentiometer', 'pot_mu', 'μ (uv→v)', 760, 300, {
      coefficient: MU / TF,
    }),
    createNode('potentiometer', 'pot_kx', '1/TF (x→v)', 240, 300, {
      coefficient: 0.1,
    }),
  ]

  const cables: Cable[] = [
    // x² = mult_x2 (out −x²/10); inv_x2 = +x²/10 for the u summer.
    c(1, 'vdp_x', 'out', 'mult_x2', 'xp'),
    c(2, 'vdp_x', 'out', 'mult_x2', 'yp'),
    c(3, 'mult_x2', 'out', 'inv_x2', 'in'),

    // u = 1 − x²:  sum_u = −(−1 + x²) = 1 − x²
    c(4, 'ref_m10', 'out', 'pot_one', 'in'),
    c(5, 'pot_one', 'out', 'sum_u', 'in0'),
    c(6, 'inv_x2', 'out', 'sum_u', 'in3'),

    // (1 − x²)·v
    c(7, 'sum_u', 'out', 'mult_uv', 'xp'),
    c(8, 'vdp_v', 'out', 'mult_uv', 'yp'),

    // ẋ = v : feed −v so the inverting integrator yields +v
    c(9, 'vdp_v', 'out', 'inv_v', 'in'),
    c(10, 'inv_v', 'out', 'pot_dx', 'in'),
    c(11, 'pot_dx', 'out', 'vdp_x', 'in0'),

    // v̇ = μ(1−x²)v − x
    c(12, 'mult_uv', 'out', 'pot_mu', 'in'),
    c(13, 'pot_mu', 'out', 'vdp_v', 'in3'),
    c(14, 'vdp_x', 'out', 'pot_kx', 'in'),
    c(15, 'pot_kx', 'out', 'vdp_v', 'in1'),
  ]

  return {
    nodes,
    cables,
    mode: 'ic',
    powered: true,
    timeScale: 2.5,
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

export function loadVanDerPol() {
  return fromSnapshot(vanDerPolSnapshot())
}

export const VAN_DER_POL_NODES = { x: 'vdp_x', v: 'vdp_v' } as const

/** X/Y scope: position vs velocity — the limit cycle. */
export const VAN_DER_POL_SCOPE_CHANNELS = [
  {
    id: 'vdpPhase',
    label: 'Van der Pol · x–ẋ',
    title: 'X/Y scope — Van der Pol limit cycle (x vs ẋ)',
    xNode: 'vdp_x',
    yNode: 'vdp_v',
    xScale: 3.2,
    yScale: 1.8,
    persistSec: 3,
  },
] as const

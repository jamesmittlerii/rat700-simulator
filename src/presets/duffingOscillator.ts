import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import type { Cable, CircuitNode, CircuitSnapshot } from '../engine/types'

/**
 * Duffing oscillator — the snapping buckled beam (double-well, x³ stiffening).
 *
 *   ẍ + δ·ẋ + β·x + α·x³ = γ·cos(ωt)
 *
 * Two-well case β = −1, α = 1, δ = 0.25, γ = 0.4, ω = 1 (Holmes-style
 * cross-well chaos). State is amplitude scaled by S = 4 (x_v = S·x) so the
 * wells sit at ±4 V and the cube term is realisable:
 *
 *   ẋ_v = v_v
 *   v̇_v = −δ·v_v + x_v − (α/S²)·x_v³ + S·γ·cos(ωt)
 *        = −0.25·v_v + x_v − 0.0625·x_v³ + 1.6·cos(ωt)
 *
 * timeFactor 1 keeps machine time equal to equation time so ω lands correctly.
 * Two multipliers form x² then x³ (out = +x_v³/100). The drive is fed directly
 * (its sign is only a phase shift for this symmetric double well).
 */

const S = 4
const DELTA = 0.25
const GAMMA = 0.4
const OMEGA = 1
const ALPHA = 1

const IC_X = S // start in the right-hand well (x = +1)
const IC_V = 0

export function duffingOscillatorSnapshot(): CircuitSnapshot {
  const nodes: CircuitNode[] = [
    createNode('reference', 'ref_p10', '+10 V', 40, 40, { voltage: 10 }),
    createNode('reference', 'ref_m10', '−10 V', 40, 120, { voltage: -10 }),
    createNode('reference', 'ref_gnd', 'Ground', 40, 200, { voltage: 0 }),

    createNode('signal', 'drive', 'γ·cos(ωt)', 40, 300, {
      waveform: 'sine',
      amplitude: S * GAMMA,
      frequency: OMEGA,
    }),

    createNode('integrator', 'duffing_x', 'Int x', 360, 80, {
      initialCondition: IC_X,
      state: IC_X,
      timeFactor: 1,
    }),
    createNode('integrator', 'duffing_v', 'Int v = ẋ', 360, 260, {
      initialCondition: IC_V,
      state: IC_V,
      timeFactor: 1,
    }),

    createNode('inverter', 'inv_x', '−x', 600, 40),
    createNode('inverter', 'inv_v', '−v', 600, 100),
    createNode('multiplier', 'mult_x2', 'x²', 160, 440),
    createNode('multiplier', 'mult_x3', 'x³', 380, 440),

    createNode('potentiometer', 'pot_delta', 'δ (v→v)', 520, 240, {
      coefficient: DELTA,
    }),
    // On a ×10 input, effective coeff = 10·k; want 0.04·x³ = 0.04·(100·M3)=4·M3.
    createNode('potentiometer', 'pot_cube', 'α/S² (x³→v)', 520, 300, {
      coefficient: (100 * ALPHA) / (S * S) / 10,
    }),
    createNode('potentiometer', 'pot_drive', 'S·γ (drive→v)', 520, 360, {
      coefficient: (S * GAMMA) / 10,
    }),
  ]

  const cables: Cable[] = [
    // ẋ = v : feed −v into the inverting x integrator (gain 1, direct)
    c(1, 'duffing_v', 'out', 'inv_v', 'in'),
    c(2, 'inv_v', 'out', 'duffing_x', 'in0'),

    // −x for the linear restoring term (β = −1 ⇒ +x_v)
    c(3, 'duffing_x', 'out', 'inv_x', 'in'),

    // x² then x³ : mult_x2 = −x²/10 ; mult_x3 = −(x²·x)/10·(−1) = +x³/100
    c(4, 'duffing_x', 'out', 'mult_x2', 'xp'),
    c(5, 'duffing_x', 'out', 'mult_x2', 'yp'),
    c(6, 'mult_x2', 'out', 'mult_x3', 'xp'),
    c(7, 'duffing_x', 'out', 'mult_x3', 'yp'),

    // v̇ = −δ·v + x − 0.04·x³ + drive
    c(8, 'duffing_v', 'out', 'pot_delta', 'in'),
    c(9, 'pot_delta', 'out', 'duffing_v', 'in0'),
    c(10, 'inv_x', 'out', 'duffing_v', 'in1'),
    c(11, 'mult_x3', 'out', 'pot_cube', 'in'),
    c(12, 'pot_cube', 'out', 'duffing_v', 'in3'),
    c(13, 'drive', 'out', 'pot_drive', 'in'),
    c(14, 'pot_drive', 'out', 'duffing_v', 'in4'),
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

export function loadDuffingOscillator() {
  return fromSnapshot(duffingOscillatorSnapshot())
}

export const DUFFING_NODES = { x: 'duffing_x', v: 'duffing_v' } as const

/** X/Y scope: position vs velocity — the two-well snapping portrait. */
export const DUFFING_SCOPE_CHANNELS = [
  {
    id: 'duffingPhase',
    label: 'Duffing · x–ẋ',
    title: 'X/Y scope — Duffing double-well (x vs ẋ)',
    xNode: 'duffing_x',
    yNode: 'duffing_v',
    xScale: 1.2,
    yScale: 1,
    persistSec: 10,
  },
] as const

import { createNode } from '../engine/elements'
import { CAR_BODY_BREAKPOINTS } from '../engine/functionGenerator'
import { fromSnapshot } from '../engine/circuit'
import type { Cable, CircuitNode, CircuitSnapshot } from '../engine/types'

export type SuspensionDamping = 'firm' | 'soft'

/**
 * Two-mass suspension + full analog X/Y figure generator
 * (display oscillator, diode FG for body, summers for wheel offsets),
 * as on the Analog Museum RAT 700 / RA 741 vehicle demo.
 *
 * @see https://www.analogmuseum.org/english/examples/vehicle_simulation/
 */
export function vehicleSuspensionSnapshot(
  damping: SuspensionDamping = 'firm',
): CircuitSnapshot {
  const beta = damping === 'firm' ? 0.4 : 0.08
  const eps = beta

  const nodes: CircuitNode[] = [
    createNode('reference', 'ref_p10', '+10 V', 20, 20, { voltage: 10 }),
    createNode('reference', 'ref_m10', '−10 V', 20, 90, { voltage: -10 }),
    createNode('reference', 'ref_gnd', 'Ground', 20, 160, { voltage: 0 }),
    createNode('signal', 'road', 'RG-1 road noise', 20, 260, {
      waveform: 'road',
      amplitude: 0.55,
      frequency: 2.5,
    }),

    // —— Suspension ——
    createNode('integrator', 'int_v1', 'ẋ body', 520, 40, {
      initialCondition: 0,
      state: 0,
    }),
    createNode('inverter', 'inv_v1', '−ẋ body', 680, 40),
    createNode('integrator', 'int_y1', 'y1 body', 820, 40, {
      initialCondition: 0,
      state: 0,
    }),
    createNode('integrator', 'int_v2', 'ẋ wheels', 520, 280, {
      initialCondition: 0,
      state: 0,
    }),
    createNode('inverter', 'inv_v2', '−ẋ wheels', 680, 280),
    createNode('integrator', 'int_y2', 'y2 wheels', 820, 280, {
      initialCondition: 0,
      state: 0,
    }),
    createNode('inverter', 'inv_y2', '−y2', 200, 200),
    createNode('summer', 'sum_d', '−δ (y1−y2)', 340, 80),
    createNode('summer', 'sum_v', '−ν (ẋ1−ẋ2)', 340, 200),
    createNode('summer', 'sum_tire', 'y2−f', 340, 340),
    createNode('summer', 'sum_a1', '−ÿ1', 520, 140),
    createNode('summer', 'sum_a2', 'ÿ2', 520, 400),
    createNode('inverter', 'inv_a2', '−ÿ2', 680, 400),
    createNode('potentiometer', 'pot_alpha', 'α spring', 420, 40, {
      coefficient: 0.85,
    }),
    createNode('potentiometer', 'pot_beta', 'β damp', 420, 140, {
      coefficient: beta,
    }),
    createNode('potentiometer', 'pot_gamma', 'γ spring', 420, 280, {
      coefficient: 0.85,
    }),
    createNode('potentiometer', 'pot_eps', 'ε damp', 420, 360, {
      coefficient: eps,
    }),
    createNode('potentiometer', 'pot_zeta', 'ζ tire', 420, 440, {
      coefficient: 1.2,
    }),

    // —— Display oscillator (~16 Hz figure rate: ω = 100) ——
    createNode('integrator', 'int_cos', 'cos (draw)', 200, 520, {
      initialCondition: 0.95,
      state: 0.95,
      inputGains: { in0: 100, in1: 1 },
    }),
    createNode('integrator', 'int_sin', 'sin (draw)', 200, 620, {
      initialCondition: 0,
      state: 0,
      inputGains: { in0: 100, in1: 1 },
    }),
    createNode('inverter', 'inv_cos', '−cos', 360, 520),
    createNode('inverter', 'inv_sin', '−sin', 360, 620),
    createNode('potentiometer', 'pot_draw_w', 'draw ω²', 360, 570, {
      coefficient: 1,
    }),

    // Wheel X offsets (~±2.4 V) — radius ≈ 0.95 V
    createNode('potentiometer', 'pot_xL', 'X offset L', 520, 520, {
      coefficient: 0.24,
    }),
    createNode('potentiometer', 'pot_xR', 'X offset R', 520, 580, {
      coefficient: 0.24,
    }),
    createNode('inverter', 'inv_xL', '−Xoff L', 660, 520),
    createNode('inverter', 'inv_xR', '−Xoff R', 660, 580),
    createNode('summer', 'sum_xL', 'scope X wheel L', 800, 520),
    createNode('summer', 'sum_xR', 'scope X wheel R', 800, 580),

    // Shared wheel Y = sin + k·y2
    createNode('potentiometer', 'pot_ym', 'Y mix wheels', 520, 640, {
      coefficient: 0.9,
    }),
    createNode('summer', 'sum_yw', 'scope Y wheels', 800, 640),

    // Body X sweep wider than wheel diameter: ≈ 3.0 · cos
    createNode('potentiometer', 'pot_bx', 'body X span', 520, 680, {
      coefficient: 0.3,
    }),
    createNode('summer', 'sum_xb', 'scope X body', 800, 680, {
      inputGains: { in0: 10, in1: 1, in2: 1 },
    }),

    // Body: FG(cos) + y1
    createNode('functionGenerator', 'fg_body', 'FG body shape', 520, 740, {
      breakpoints: CAR_BODY_BREAKPOINTS,
    }),
    createNode('inverter', 'inv_fg', '−FG', 660, 740),
    createNode('inverter', 'inv_y1', '−y1', 660, 800),
    createNode('summer', 'sum_yb', 'scope Y body', 800, 760),
  ]

  const cables: Cable[] = [
    // Suspension (same as before)
    c(1, 'int_y2', 'out', 'inv_y2', 'in'),
    c(2, 'int_y1', 'out', 'sum_d', 'in0'),
    c(3, 'inv_y2', 'out', 'sum_d', 'in1'),
    c(4, 'int_v1', 'out', 'sum_v', 'in0'),
    c(5, 'inv_v2', 'out', 'sum_v', 'in1'),
    c(6, 'inv_y2', 'out', 'sum_tire', 'in0'),
    c(7, 'road', 'out', 'sum_tire', 'in1'),
    c(8, 'sum_d', 'out', 'pot_alpha', 'in'),
    c(9, 'sum_v', 'out', 'pot_beta', 'in'),
    c(10, 'sum_d', 'out', 'pot_gamma', 'in'),
    c(11, 'sum_v', 'out', 'pot_eps', 'in'),
    c(12, 'sum_tire', 'out', 'pot_zeta', 'in'),
    c(13, 'pot_alpha', 'out', 'sum_a1', 'in0'),
    c(14, 'pot_beta', 'out', 'sum_a1', 'in1'),
    c(15, 'sum_a1', 'out', 'int_v1', 'in0'),
    c(16, 'int_v1', 'out', 'inv_v1', 'in'),
    c(17, 'inv_v1', 'out', 'int_y1', 'in0'),
    c(18, 'pot_gamma', 'out', 'sum_a2', 'in0'),
    c(19, 'pot_eps', 'out', 'sum_a2', 'in1'),
    c(20, 'pot_zeta', 'out', 'sum_a2', 'in2'),
    c(21, 'sum_a2', 'out', 'inv_a2', 'in'),
    c(22, 'inv_a2', 'out', 'int_v2', 'in0'),
    c(23, 'int_v2', 'out', 'inv_v2', 'in'),
    c(24, 'inv_v2', 'out', 'int_y2', 'in0'),

    // Display oscillator: d(cos)/dt = −sin, d(sin)/dt = 10·k·cos
    c(25, 'int_sin', 'out', 'int_cos', 'in0'),
    c(26, 'int_cos', 'out', 'inv_cos', 'in'),
    c(27, 'inv_cos', 'out', 'pot_draw_w', 'in'),
    c(28, 'pot_draw_w', 'out', 'int_sin', 'in0'),
    c(29, 'int_sin', 'out', 'inv_sin', 'in'),

    // Wheel X = cos + xOff  (sum of −cos and −xOff)
    c(30, 'ref_m10', 'out', 'pot_xL', 'in'),
    c(31, 'ref_p10', 'out', 'pot_xR', 'in'),
    c(32, 'pot_xL', 'out', 'inv_xL', 'in'),
    c(33, 'pot_xR', 'out', 'inv_xR', 'in'),
    c(34, 'inv_cos', 'out', 'sum_xL', 'in0'),
    c(35, 'inv_xL', 'out', 'sum_xL', 'in1'),
    c(36, 'inv_cos', 'out', 'sum_xR', 'in0'),
    c(37, 'inv_xR', 'out', 'sum_xR', 'in1'),

    // Wheel Y = sin + k·y2  (sum of −sin and pot(−y2))
    c(38, 'inv_y2', 'out', 'pot_ym', 'in'),
    c(39, 'inv_sin', 'out', 'sum_yw', 'in0'),
    c(40, 'pot_ym', 'out', 'sum_yw', 'in1'),

    // Body Y = FG(cos) + y1
    c(41, 'int_cos', 'out', 'fg_body', 'in'),
    c(42, 'fg_body', 'out', 'inv_fg', 'in'),
    c(43, 'int_y1', 'out', 'inv_y1', 'in'),
    c(44, 'inv_fg', 'out', 'sum_yb', 'in0'),
    c(45, 'inv_y1', 'out', 'sum_yb', 'in1'),

    // Body/chassis X = 10 · pot_bx · (−(−cos)) = 10 · 0.3 · cos ≈ 3·cos
    c(46, 'inv_cos', 'out', 'pot_bx', 'in'),
    c(47, 'pot_bx', 'out', 'sum_xb', 'in0'),
  ]

  return {
    nodes,
    cables,
    mode: 'ic',
    powered: true,
    timeScale: 4,
    time: 0,
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

export function loadVehicleSuspension(damping: SuspensionDamping = 'firm') {
  return fromSnapshot(vehicleSuspensionSnapshot(damping))
}

export const VEHICLE_NODES = {
  body: 'int_y1',
  wheels: 'int_y2',
  road: 'road',
  dampBody: 'pot_beta',
  dampWheels: 'pot_eps',
  cos: 'int_cos',
} as const

/** Multiplexed X/Y scope channels — frame outline + wheels (no axle through hubs). */
export const VEHICLE_SCOPE_CHANNELS = [
  { id: 'wheelL', label: 'wheel L', xNode: 'sum_xL', yNode: 'sum_yw' },
  { id: 'wheelR', label: 'wheel R', xNode: 'sum_xR', yNode: 'sum_yw' },
  { id: 'bodyTop', label: 'body top', xNode: 'sum_xb', yNode: 'sum_yb' },
  /** Rocker / lower frame at body height y1 — not through wheel centers. */
  { id: 'bodyBot', label: 'body bottom', xNode: 'sum_xb', yNode: 'int_y1' },
] as const

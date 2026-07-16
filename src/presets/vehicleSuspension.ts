import { createNode } from '../engine/elements'
import { CAR_BODY_BREAKPOINTS } from '../engine/functionGenerator'
import { fromSnapshot } from '../engine/circuit'
import { defaultJumpers, upsertJumper } from '../engine/jumpers'
import type { Cable, CircuitNode, CircuitSnapshot, JumperPlacement } from '../engine/types'

export type SuspensionDamping = 'firm' | 'soft'

/**
 * Two-mass suspension + analog X/Y figure generator, fitted to the RAT 700’s
 * 15 computing-amplifier strips (FG on F1 does not count).
 *
 * Physics uses classic Kelvin ∫ chains (no inter-∫ inverters): body ∫s yield
 * (−v1, y1); wheel ∫s yield (v2, −y2). Shared inv_delta recovers +δ for the
 * spring pots. Tire spring is folded into sum_a2 as ζ·(−y2) and ζ·f.
 *
 * Display: 2∫+inv_cos oscillator (same as harmonicOscillator); wheel X from
 * inv_cos ± pot offsets; wheel Y = −sin + k·y2; body Y = FG + y1 composited
 * in the scope mux (no sum_yb strip amp).
 *
 * Strip mapping puts 4-input sum_a2 and sum_yw on switchable amps (e–k pads);
 * 2-input summers on summer-only strips use in0 + S.
 *
 * @see https://www.analogmuseum.org/english/examples/vehicle_simulation/
 */
export function vehicleSuspensionSnapshot(
  damping: SuspensionDamping = 'firm',
): CircuitSnapshot {
  // Real-time (timeScale 1): physics ∫s use timeFactor 10 so body bounce
  // sits near ~1.5 Hz (α≈0.85 → ω≈10√α). Road ≈ 30 mph / 3 m bumps (~4.5 Hz).
  const beta = damping === 'firm' ? 1 : 0.35
  const eps = beta
  const zeta = 1.2

  // Computing amps in faceplate strip order (ampSlot / layout idx 0…14).
  // Switchable strips: 0,1,4,5,9,10,13,14 — hold all 6∫ plus sum_a2 & sum_yw.
  const nodes: CircuitNode[] = [
    createNode('reference', 'ref_p10', '+10 V', 20, 20, { voltage: 10 }),
    createNode('reference', 'ref_m10', '−10 V', 20, 90, { voltage: -10 }),
    createNode('reference', 'ref_gnd', 'Ground', 20, 160, { voltage: 0 }),
    createNode('signal', 'road', 'RG-1 road noise', 20, 260, {
      waveform: 'road',
      amplitude: 0.013,
      frequency: 28,
    }),

    createNode('integrator', 'int_v1', '−ẋ body', 520, 40, {
      initialCondition: 0,
      state: 0,
      ampSlot: 0,
      timeFactor: 10,
    }),
    createNode('integrator', 'int_y1', 'y1 body', 820, 40, {
      initialCondition: 0,
      state: 0,
      ampSlot: 1,
      timeFactor: 10,
    }),
    createNode('summer', 'sum_d', '−δ (y1−y2)', 340, 80, { ampSlot: 2 }),
    createNode('summer', 'sum_v', 'ν (ẋ1−ẋ2)', 340, 200, { ampSlot: 3 }),
    createNode('integrator', 'int_v2', 'ẋ wheels', 520, 280, {
      initialCondition: 0,
      state: 0,
      ampSlot: 4,
      timeFactor: 10,
    }),
    createNode('integrator', 'int_y2', '−y2 wheels', 820, 280, {
      initialCondition: 0,
      state: 0,
      ampSlot: 5,
      timeFactor: 10,
    }),
    createNode('summer', 'sum_a1', 'ÿ1', 520, 140, { ampSlot: 6 }),
    createNode('inverter', 'inv_delta', '+δ', 200, 80, { ampSlot: 7 }),
    createNode('inverter', 'inv_cos', '−cos', 360, 520, { ampSlot: 8 }),
    createNode('integrator', 'int_cos', 'cos (draw)', 200, 520, {
      initialCondition: 0.95,
      state: 0.95,
      inputGains: { in0: 100, in1: 1 },
      ampSlot: 9,
      timeFactor: 1,
    }),
    createNode('integrator', 'int_sin', 'sin (draw)', 200, 620, {
      initialCondition: 0,
      state: 0,
      inputGains: { in0: 100, in1: 1 },
      ampSlot: 10,
      timeFactor: 1,
    }),
    createNode('summer', 'sum_xL', 'scope X wheel L', 800, 520, { ampSlot: 11 }),
    createNode('summer', 'sum_xR', 'scope X wheel R', 800, 580, { ampSlot: 12 }),
    createNode('summer', 'sum_a2', '−ÿ2', 520, 400, { ampSlot: 13 }),
    createNode('summer', 'sum_yw', 'scope Y wheels', 800, 640, { ampSlot: 14 }),

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
    createNode('potentiometer', 'pot_zeta', 'ζ tire y2', 420, 440, {
      coefficient: zeta,
    }),
    createNode('potentiometer', 'pot_zf', 'ζ tire f', 420, 480, {
      coefficient: zeta,
    }),
    createNode('potentiometer', 'pot_draw_w', 'draw ω²', 360, 570, {
      coefficient: 1,
    }),
    createNode('potentiometer', 'pot_xL', 'X offset L', 520, 520, {
      coefficient: 0.3,
    }),
    createNode('potentiometer', 'pot_xR', 'X offset R', 520, 580, {
      coefficient: 0.3,
    }),
    createNode('potentiometer', 'pot_ym', 'Y mix wheels', 520, 640, {
      coefficient: 0.045,
    }),

    // F1 — not a strip amp (fromSnapshot also ensures empty F2)
    createNode('functionGenerator', 'fg_1', 'FG body shape', 520, 740, {
      breakpoints: CAR_BODY_BREAKPOINTS,
    }),
  ]

  const cables: Cable[] = [
    // δ = y1 − y2 = y1 + (−y2); sum_d = −δ; inv_delta = +δ
    c(1, 'int_y1', 'out', 'sum_d', 'in0'),
    c(2, 'int_y2', 'out', 'sum_d', 's'),
    c(3, 'sum_d', 'out', 'inv_delta', 'in'),

    // ν = v1 − v2 with int_v1=−v1, int_v2=+v2 → sum_v = ν
    c(4, 'int_v1', 'out', 'sum_v', 'in0'),
    c(5, 'int_v2', 'out', 'sum_v', 's'),

    // Springs / dampers from +δ and +ν
    c(6, 'inv_delta', 'out', 'pot_alpha', 'in'),
    c(7, 'sum_v', 'out', 'pot_beta', 'in'),
    c(8, 'inv_delta', 'out', 'pot_gamma', 'in'),
    c(9, 'sum_v', 'out', 'pot_eps', 'in'),

    // ÿ1 = −(αδ + βν); int_v1 → −v1; int_y1 ← −v1 → y1
    c(10, 'pot_alpha', 'out', 'sum_a1', 'in0'),
    c(11, 'pot_beta', 'out', 'sum_a1', 's'),
    c(12, 'sum_a1', 'out', 'int_v1', 'in0'),
    c(13, 'int_v1', 'out', 'int_y1', 'in0'),

    // −ÿ2 into int_v2 → +v2; int_y2 ← v2 → −y2 (tire folded into sum_a2)
    c(14, 'pot_gamma', 'out', 'sum_a2', 'in0'),
    c(15, 'pot_eps', 'out', 'sum_a2', 'in1'),
    c(16, 'int_y2', 'out', 'pot_zeta', 'in'),
    c(17, 'pot_zeta', 'out', 'sum_a2', 'in2'),
    c(18, 'road', 'out', 'pot_zf', 'in'),
    c(19, 'pot_zf', 'out', 'sum_a2', 'in3'),
    c(20, 'sum_a2', 'out', 'int_v2', 'in0'),
    c(21, 'int_v2', 'out', 'int_y2', 'in0'),

    // Display HO: d(cos)/dt = −sin, d(sin)/dt = ω² cos
    c(22, 'int_sin', 'out', 'int_cos', 'in0'),
    c(23, 'int_cos', 'out', 'inv_cos', 'in'),
    c(24, 'inv_cos', 'out', 'pot_draw_w', 'in'),
    c(25, 'pot_draw_w', 'out', 'int_sin', 'in0'),

    // Wheel X = cos ± offset (sum of −cos and pot±E)
    c(26, 'ref_m10', 'out', 'pot_xL', 'in'),
    c(27, 'ref_p10', 'out', 'pot_xR', 'in'),
    c(28, 'inv_cos', 'out', 'sum_xL', 'in0'),
    c(29, 'pot_xL', 'out', 'sum_xL', 's'),
    c(30, 'inv_cos', 'out', 'sum_xR', 'in0'),
    c(31, 'pot_xR', 'out', 'sum_xR', 's'),

    // Wheel Y = −sin + k·y2 (int_y2 = −y2 → pot = −k y2)
    c(32, 'int_y2', 'out', 'pot_ym', 'in'),
    c(33, 'int_sin', 'out', 'sum_yw', 'in0'),
    c(34, 'pot_ym', 'out', 'sum_yw', 'in1'),

    // Body silhouette FG(cos); Y mix with y1 is scope-side
    c(35, 'int_cos', 'out', 'fg_1', 'in'),
  ]

  let jumpers: JumperPlacement[] = defaultJumpers()
  for (const slot of [0, 1, 4, 5, 9, 10]) {
    jumpers = upsertJumper(jumpers, {
      id: `jmode_${slot}`,
      kind: 'mode4',
      ampSlot: slot,
      position: 'integral',
    })
  }
  // Physics chain on ×10 caps (slots 0,1,4,5); drawing HO stays ×1.
  for (const slot of [0, 1, 4, 5]) {
    jumpers = upsertJumper(jumpers, {
      id: `jtime_${slot}`,
      kind: 'time2',
      ampSlot: slot,
      position: '10',
    })
  }

  return {
    nodes,
    cables,
    mode: 'ic',
    powered: true,
    timeScale: 1,
    time: 0,
    panelButton: 'pause',
    jumpers,
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
  {
    id: 'wheelL',
    label: 'wheel L',
    xNode: 'sum_xL',
    yNode: 'int_sin',
    xScale: 0.42,
    yScale: -0.42,
    yOffset: -0.52,
    /** Wheel hub bounce — small, applied after orbit scale. */
    yAddNodes: ['int_y2'],
    yAddScale: 1,
  },
  {
    id: 'wheelR',
    label: 'wheel R',
    xNode: 'sum_xR',
    yNode: 'int_sin',
    xScale: 0.42,
    yScale: -0.42,
    yOffset: -0.52,
    yAddNodes: ['int_y2'],
    yAddScale: 1,
  },
  {
    id: 'bodyTop',
    label: 'body top',
    xNode: 'int_cos',
    yNode: 'fg_1',
    xScale: 1.68,
    yScale: 0.78,
    yOffset: 0.15,
    /** Body bounce rides on y1 1:1 after FG scaling (rigid with sill). */
    yAddNodes: ['int_y1'],
  },
  {
    id: 'bodyBot',
    label: 'body bottom',
    xNode: 'int_cos',
    yNode: 'int_y1',
    xScale: 1.68,
    yOffset: 0.2,
  },
] as const

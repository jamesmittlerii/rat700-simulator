import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import type { CircuitNode } from '../engine/types'
import {
  baseSnapshot,
  cable as c,
  integratorNode,
  potK1,
  potK10,
  referenceNodes,
} from './helpers'

/**
 * Soft-spring restricted three-body — two free masses + fixed third at origin.
 *
 * Body C sits at the origin (no integrators). Bodies A and B move in the plane
 * under linear springs to C and to each other; A's anchors soften with a cubic
 * term (Duffing-soft), so large swings breathe instead of staying elliptical:
 *
 *   v̇xA = −(kc+kab)·xA + kab·xB + γ·xA³ − δ·vxA
 *   v̇yA = −(kc+kab)·yA + kab·yB + γ·yA³ − δ·vyA
 *   v̇xB = −(kc+kab)·xB + kab·xA − δ·vxB
 *   v̇yB = −(kc+kab)·yB + kab·yA − δ·vyB
 *
 * Machine units = equation units (±10 V). Four quarter-square multipliers form
 * xA³ and yA³ (out = +u³/100). Integrators run at timeFactor 1; large linear
 * gains use ×10 pads so every pot stays in (0,1].
 *
 * Scope shows body A's orbit (xA vs yA) — a drifting phosphor flower.
 */

const KC = 1
const KAB = 0.55
const GAMMA = 0.028
const DELTA = 0.008
const TF = 1

/** Combined A/B self stiffness (anchor + coupling). */
const KSELF = KC + KAB

const IC = {
  xA: 4,
  yA: 0.8,
  vxA: 0.3,
  vyA: 2.6,
  xB: -2.8,
  yB: 2.5,
  vxB: -1.2,
  vyB: -1.8,
} as const

export function softSpringThreeBodySnapshot() {
  const nodes: CircuitNode[] = [
    ...referenceNodes(),

    // Body A state
    integratorNode('ss3_xA', 'Int xA', 360, 40, IC.xA, { timeFactor: TF }),
    integratorNode('ss3_yA', 'Int yA', 360, 140, IC.yA, { timeFactor: TF }),
    integratorNode('ss3_vxA', 'Int vxA', 360, 240, IC.vxA, { timeFactor: TF }),
    integratorNode('ss3_vyA', 'Int vyA', 360, 340, IC.vyA, { timeFactor: TF }),

    // Body B state
    integratorNode('ss3_xB', 'Int xB', 360, 460, IC.xB, { timeFactor: TF }),
    integratorNode('ss3_yB', 'Int yB', 360, 560, IC.yB, { timeFactor: TF }),
    integratorNode('ss3_vxB', 'Int vxB', 360, 660, IC.vxB, { timeFactor: TF }),
    integratorNode('ss3_vyB', 'Int vyB', 360, 760, IC.vyB, { timeFactor: TF }),

    // −v for ṙ = v into the inverting position integrators
    createNode('inverter', 'ss3_inv_vxA', '−vxA', 200, 240),
    createNode('inverter', 'ss3_inv_vyA', '−vyA', 200, 340),
    createNode('inverter', 'ss3_inv_vxB', '−vxB', 200, 660),
    createNode('inverter', 'ss3_inv_vyB', '−vyB', 200, 760),

    // −positions for cross-coupling into the other body
    createNode('inverter', 'ss3_inv_xA', '−xA', 560, 40),
    createNode('inverter', 'ss3_inv_yA', '−yA', 560, 140),
    createNode('inverter', 'ss3_inv_xB', '−xB', 560, 460),
    createNode('inverter', 'ss3_inv_yB', '−yB', 560, 560),

    // Soft cubic on A: x²→x³ and y²→y³ (mult out = +u³/100)
    createNode('multiplier', 'ss3_mult_x2', 'xA²', 40, 400),
    createNode('multiplier', 'ss3_mult_x3', 'xA³', 40, 480),
    createNode('multiplier', 'ss3_mult_y2', 'yA²', 40, 580),
    createNode('multiplier', 'ss3_mult_y3', 'yA³', 40, 660),
    createNode('inverter', 'ss3_inv_x3', '−xA³/100', 160, 480),
    createNode('inverter', 'ss3_inv_y3', '−yA³/100', 160, 660),

    // Linear self / couple / damp / soft pots
    createNode('potentiometer', 'ss3_pot_kAx', 'kself (xA→vxA)', 720, 220, {
      coefficient: potK10(KSELF, TF),
    }),
    createNode('potentiometer', 'ss3_pot_kAy', 'kself (yA→vyA)', 720, 280, {
      coefficient: potK10(KSELF, TF),
    }),
    createNode('potentiometer', 'ss3_pot_kBx', 'kself (xB→vxB)', 720, 640, {
      coefficient: potK10(KSELF, TF),
    }),
    createNode('potentiometer', 'ss3_pot_kBy', 'kself (yB→vyB)', 720, 700, {
      coefficient: potK10(KSELF, TF),
    }),

    createNode('potentiometer', 'ss3_pot_cAx', 'kab (−xB→vxA)', 720, 340, {
      coefficient: potK1(KAB, TF),
    }),
    createNode('potentiometer', 'ss3_pot_cAy', 'kab (−yB→vyA)', 720, 400, {
      coefficient: potK1(KAB, TF),
    }),
    createNode('potentiometer', 'ss3_pot_cBx', 'kab (−xA→vxB)', 720, 520, {
      coefficient: potK1(KAB, TF),
    }),
    createNode('potentiometer', 'ss3_pot_cBy', 'kab (−yA→vyB)', 720, 580, {
      coefficient: potK1(KAB, TF),
    }),

    createNode('potentiometer', 'ss3_pot_dAx', 'δ (vxA)', 880, 240, {
      coefficient: potK1(DELTA, TF),
    }),
    createNode('potentiometer', 'ss3_pot_dAy', 'δ (vyA)', 880, 340, {
      coefficient: potK1(DELTA, TF),
    }),
    createNode('potentiometer', 'ss3_pot_dBx', 'δ (vxB)', 880, 660, {
      coefficient: potK1(DELTA, TF),
    }),
    createNode('potentiometer', 'ss3_pot_dBy', 'δ (vyB)', 880, 760, {
      coefficient: potK1(DELTA, TF),
    }),

    // Soft: gain-10 · k · (−u³/100) = −(k/10)·u³ ; want −γ·u³ ⇒ k = 10γ
    createNode('potentiometer', 'ss3_pot_softX', 'γ (x³→vxA)', 880, 480, {
      coefficient: 10 * GAMMA / TF,
    }),
    createNode('potentiometer', 'ss3_pot_softY', 'γ (y³→vyA)', 880, 580, {
      coefficient: 10 * GAMMA / TF,
    }),
  ]

  const cables = [
    // −velocities
    c(1, 'ss3_vxA', 'out', 'ss3_inv_vxA', 'in'),
    c(2, 'ss3_vyA', 'out', 'ss3_inv_vyA', 'in'),
    c(3, 'ss3_vxB', 'out', 'ss3_inv_vxB', 'in'),
    c(4, 'ss3_vyB', 'out', 'ss3_inv_vyB', 'in'),

    // ẋ = v (feed −v into inverting position integrators)
    c(5, 'ss3_inv_vxA', 'out', 'ss3_xA', 'in0'),
    c(6, 'ss3_inv_vyA', 'out', 'ss3_yA', 'in0'),
    c(7, 'ss3_inv_vxB', 'out', 'ss3_xB', 'in0'),
    c(8, 'ss3_inv_vyB', 'out', 'ss3_yB', 'in0'),

    // −positions for coupling
    c(9, 'ss3_xA', 'out', 'ss3_inv_xA', 'in'),
    c(10, 'ss3_yA', 'out', 'ss3_inv_yA', 'in'),
    c(11, 'ss3_xB', 'out', 'ss3_inv_xB', 'in'),
    c(12, 'ss3_yB', 'out', 'ss3_inv_yB', 'in'),

    // Cubes: mult2 = −u²/10 ; mult3 = +u³/100 ; inv = −u³/100
    c(13, 'ss3_xA', 'out', 'ss3_mult_x2', 'xp'),
    c(14, 'ss3_xA', 'out', 'ss3_mult_x2', 'yp'),
    c(15, 'ss3_mult_x2', 'out', 'ss3_mult_x3', 'xp'),
    c(16, 'ss3_xA', 'out', 'ss3_mult_x3', 'yp'),
    c(17, 'ss3_mult_x3', 'out', 'ss3_inv_x3', 'in'),

    c(18, 'ss3_yA', 'out', 'ss3_mult_y2', 'xp'),
    c(19, 'ss3_yA', 'out', 'ss3_mult_y2', 'yp'),
    c(20, 'ss3_mult_y2', 'out', 'ss3_mult_y3', 'xp'),
    c(21, 'ss3_yA', 'out', 'ss3_mult_y3', 'yp'),
    c(22, 'ss3_mult_y3', 'out', 'ss3_inv_y3', 'in'),

    // v̇xA = −kself·xA + kab·xB + γ·xA³ − δ·vxA
    c(23, 'ss3_xA', 'out', 'ss3_pot_kAx', 'in'),
    c(24, 'ss3_pot_kAx', 'out', 'ss3_vxA', 'in3'),
    c(25, 'ss3_inv_xB', 'out', 'ss3_pot_cAx', 'in'),
    c(26, 'ss3_pot_cAx', 'out', 'ss3_vxA', 'in0'),
    c(27, 'ss3_inv_x3', 'out', 'ss3_pot_softX', 'in'),
    c(28, 'ss3_pot_softX', 'out', 'ss3_vxA', 'in4'),
    c(29, 'ss3_vxA', 'out', 'ss3_pot_dAx', 'in'),
    c(30, 'ss3_pot_dAx', 'out', 'ss3_vxA', 'in1'),

    // v̇yA
    c(31, 'ss3_yA', 'out', 'ss3_pot_kAy', 'in'),
    c(32, 'ss3_pot_kAy', 'out', 'ss3_vyA', 'in3'),
    c(33, 'ss3_inv_yB', 'out', 'ss3_pot_cAy', 'in'),
    c(34, 'ss3_pot_cAy', 'out', 'ss3_vyA', 'in0'),
    c(35, 'ss3_inv_y3', 'out', 'ss3_pot_softY', 'in'),
    c(36, 'ss3_pot_softY', 'out', 'ss3_vyA', 'in4'),
    c(37, 'ss3_vyA', 'out', 'ss3_pot_dAy', 'in'),
    c(38, 'ss3_pot_dAy', 'out', 'ss3_vyA', 'in1'),

    // v̇xB = −kself·xB + kab·xA − δ·vxB
    c(39, 'ss3_xB', 'out', 'ss3_pot_kBx', 'in'),
    c(40, 'ss3_pot_kBx', 'out', 'ss3_vxB', 'in3'),
    c(41, 'ss3_inv_xA', 'out', 'ss3_pot_cBx', 'in'),
    c(42, 'ss3_pot_cBx', 'out', 'ss3_vxB', 'in0'),
    c(43, 'ss3_vxB', 'out', 'ss3_pot_dBx', 'in'),
    c(44, 'ss3_pot_dBx', 'out', 'ss3_vxB', 'in1'),

    // v̇yB
    c(45, 'ss3_yB', 'out', 'ss3_pot_kBy', 'in'),
    c(46, 'ss3_pot_kBy', 'out', 'ss3_vyB', 'in3'),
    c(47, 'ss3_inv_yA', 'out', 'ss3_pot_cBy', 'in'),
    c(48, 'ss3_pot_cBy', 'out', 'ss3_vyB', 'in0'),
    c(49, 'ss3_vyB', 'out', 'ss3_pot_dBy', 'in'),
    c(50, 'ss3_pot_dBy', 'out', 'ss3_vyB', 'in1'),
  ]

  return baseSnapshot(nodes, cables, { timeScale: 2 })
}

export function loadSoftSpringThreeBody() {
  return fromSnapshot(softSpringThreeBodySnapshot())
}

export const SOFT_SPRING_NODES = {
  xA: 'ss3_xA',
  yA: 'ss3_yA',
  xB: 'ss3_xB',
  yB: 'ss3_yB',
} as const

/** X/Y scope: body A's planar orbit around the fixed third mass. */
export const SOFT_SPRING_SCOPE_CHANNELS = [
  {
    id: 'softSpringA',
    label: 'Soft spring · xA–yA',
    title: 'X/Y scope — soft-spring three-body (body A orbit)',
    xNode: 'ss3_xA',
    yNode: 'ss3_yA',
    xScale: 1.8,
    yScale: 1.8,
    persistSec: 8,
  },
] as const

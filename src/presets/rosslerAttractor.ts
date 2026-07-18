import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import type { CircuitNode } from '../engine/types'
import {
  baseSnapshot,
  cable as c,
  integratorNode,
  potK1,
  potK10,
  potKMul10,
  referenceNodes,
} from './helpers'

/**
 * Rössler attractor — the "folded ribbon" chaos, lighter than Lorenz (a single
 * non-linear x·z multiplier).
 *
 * Physical system (a = 0.2, b = 0.2, c = 5.7):
 *   ẋ = −y − z
 *   ẏ = x + a·y
 *   ż = b + z(x − c) = b + x·z − c·z
 *
 * Amplitude-scaled onto the ±10 V machine unit with Sx = Sy = 2, Sz = 4:
 *   v̇X = −vY − 2·vZ
 *   v̇Y = vX + 0.2·vY
 *   v̇Z = 0.05 + 2·vX·vZ − 5.7·vZ
 *
 * Integrators run at timeFactor 10 so the c = 5.7 and product gains fit as
 * pot·gain; the equal factor preserves the attractor's time scale. The single
 * quarter-square multiplier forms x·z (out = −(vX·vZ)/10).
 */

const SX = 2
const SY = 2
const SZ = 4
const A = 0.2
const B = 0.2
const C = 5.7
const TF = 10

const IC_X = 2 / SX
const IC_Y = 2 / SY
const IC_Z = 0

export function rosslerAttractorSnapshot() {
  const nodes: CircuitNode[] = [
    ...referenceNodes(),

    integratorNode('ross_x', 'Int x', 360, 80, IC_X, { timeFactor: TF }),
    integratorNode('ross_y', 'Int y', 360, 260, IC_Y, { timeFactor: TF }),
    integratorNode('ross_z', 'Int z', 360, 440, IC_Z, { timeFactor: TF }),

    createNode('inverter', 'inv_x', '−x', 600, 80),
    createNode('inverter', 'inv_y', '−y', 600, 20),

    createNode('multiplier', 'mult_xz', 'x·z', 200, 440),

    // v̇X = −vY − 2·vZ
    createNode('potentiometer', 'pot_xy', 'Sy/Sx (y→x)', 520, 120, {
      coefficient: potK1(SY / SX, TF),
    }),
    createNode('potentiometer', 'pot_xz', 'Sz/Sx (z→x)', 520, 160, {
      coefficient: potK1(SZ / SX, TF),
    }),
    // v̇Y = vX + a·vY  (a is regenerative positive feedback)
    createNode('potentiometer', 'pot_yx', 'Sx/Sy (x→y)', 520, 240, {
      coefficient: potK1(SX / SY, TF),
    }),
    createNode('potentiometer', 'pot_ya', 'a (y→y)', 520, 280, {
      coefficient: potK1(A, TF),
    }),
    // v̇Z = 0.05 + 2·vX·vZ − 5.7·vZ
    createNode('potentiometer', 'pot_zc', 'c (z decay)', 520, 420, {
      coefficient: potK1(C, TF),
    }),
    createNode('potentiometer', 'pot_zb', 'b/Sz (const)', 520, 460, {
      coefficient: potK10(B / SZ, TF),
    }),
    createNode('potentiometer', 'pot_zxz', 'Sx (xz→z)', 520, 500, {
      coefficient: potKMul10(SX, TF),
    }),
  ]

  const cables = [
    c(1, 'ross_x', 'out', 'inv_x', 'in'), // −vX
    c(2, 'ross_y', 'out', 'inv_y', 'in'), // −vY

    c(3, 'ross_x', 'out', 'mult_xz', 'xp'),
    c(4, 'ross_z', 'out', 'mult_xz', 'yp'),

    // v̇X = −vY − 2·vZ (positive sources, gain-1 inputs)
    c(5, 'ross_y', 'out', 'pot_xy', 'in'),
    c(6, 'pot_xy', 'out', 'ross_x', 'in0'),
    c(7, 'ross_z', 'out', 'pot_xz', 'in'),
    c(8, 'pot_xz', 'out', 'ross_x', 'in1'),

    // v̇Y = vX + a·vY (from −vX, −vY)
    c(9, 'inv_x', 'out', 'pot_yx', 'in'),
    c(10, 'pot_yx', 'out', 'ross_y', 'in0'),
    c(11, 'inv_y', 'out', 'pot_ya', 'in'),
    c(12, 'pot_ya', 'out', 'ross_y', 'in1'),

    // v̇Z = 0.05 + 2·vX·vZ − 5.7·vZ
    c(13, 'ross_z', 'out', 'pot_zc', 'in'),
    c(14, 'pot_zc', 'out', 'ross_z', 'in0'),
    c(15, 'ref_m10', 'out', 'pot_zb', 'in'),
    c(16, 'pot_zb', 'out', 'ross_z', 'in2'),
    c(17, 'mult_xz', 'out', 'pot_zxz', 'in'),
    c(18, 'pot_zxz', 'out', 'ross_z', 'in3'),
  ]

  return baseSnapshot(nodes, cables, { timeScale: 2 })
}

export function loadRosslerAttractor() {
  return fromSnapshot(rosslerAttractorSnapshot())
}

export const ROSSLER_NODES = { x: 'ross_x', y: 'ross_y', z: 'ross_z' } as const

/** X/Y scope: the flat spiral is the x–y projection. */
export const ROSSLER_SCOPE_CHANNELS = [
  {
    id: 'rosslerXY',
    label: 'Rössler · x–y',
    title: 'X/Y scope — Rössler attractor (x–y spiral)',
    xNode: 'ross_x',
    yNode: 'ross_y',
    xScale: 1.4,
    yScale: 1.4,
    persistSec: 6,
  },
] as const

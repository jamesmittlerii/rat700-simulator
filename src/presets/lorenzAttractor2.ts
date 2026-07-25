import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import { defaultJumpers, upsertJumper } from '../engine/jumpers'
import type { CircuitNode, JumperPlacement } from '../engine/types'
import {
  baseSnapshot,
  cable as c,
  integratorNode,
  potK1,
  potK10,
  referenceNodes,
} from './helpers'

/**
 * Lorenz Attractor 2 — classic butterfly with four pots (σ, ρ, β, y-damp).
 *
 * Physical system (σ = 10, ρ = 28, β = 8/3):
 *   ẋ = σ(y − x)
 *   ẏ = ρx − x·z − y
 *   ż = x·y − β·z
 *
 * Amplitude scale Sx = Sy = Sz = 10 so (Y−X) shares one σ pot and the
 * nonlinear terms land on plain ×10 pads:
 *   v̇X = σ(vY − vX)
 *   v̇Y = ρ·vX − 10·vX·vZ − vY
 *   v̇Z = 10·vX·vY − β·vZ
 *
 * Patch (6 computing amps + 2 multipliers + 4 pots):
 *   SUM (X−Y) ← −X, +Y  →  pot σ  →  INT X ×1
 *   pot ρ ← −X  →  INT Y ×10
 *   MUL xz (+X, −Z) → INT Y ×10          (= −10·vX·vZ after ∫)
 *   +Y → pot ydamp (0.1) → INT Y ×1     (= −vY)
 *   MUL xy (+X, +Y) → INT Z ×10          (= +10·vX·vY after ∫)
 *   pot β ← +Z  →  INT Z ×1
 *
 * Faceplate: Int x/y/z on amps 01, 02, 05 with ∫ + time×10; inverters on
 * summer-only 03/04; X−Y summer on switchable amp 06 (Σ).
 */

const S = 10
const SIGMA = 10
const RHO = 28
const BETA = 8 / 3
const TF = 10

const IC = 1 / S

export function lorenzAttractor2Snapshot() {
  const nodes: CircuitNode[] = [
    ...referenceNodes(),

    // Computing-amp order = faceplate strips 01…06.
    // SUM (X−Y) must sit on a switchable strip (e–k) so both ×1 inputs exist;
    // inverters fit on summer-only strips (single ×1).
    integratorNode('lorenz2_x', 'Int x', 360, 80, IC, {
      timeFactor: TF,
      ampSlot: 0,
    }),
    integratorNode('lorenz2_y', 'Int y', 360, 260, IC, {
      timeFactor: TF,
      ampSlot: 1,
    }),
    createNode('inverter', 'lorenz2_inv_x', '−x', 600, 80),
    createNode('inverter', 'lorenz2_inv_z', '−z', 600, 440),
    integratorNode('lorenz2_z', 'Int z', 360, 440, IC, {
      timeFactor: TF,
      ampSlot: 4,
    }),
    createNode('summer', 'sum_dx', 'X−Y', 520, 140, { ampSlot: 5 }),

    createNode('multiplier', 'lorenz2_mult_xz', 'x·z', 200, 360),
    createNode('multiplier', 'lorenz2_mult_xy', 'x·y', 200, 520),

    createNode('potentiometer', 'pot_sigma', 'σ', 500, 140, {
      coefficient: potK1(SIGMA, TF),
    }),
    createNode('potentiometer', 'pot_rho', 'ρ', 500, 260, {
      coefficient: potK10(RHO, TF),
    }),
    createNode('potentiometer', 'pot_ydamp', 'y damp', 500, 320, {
      coefficient: potK1(1, TF),
    }),
    createNode('potentiometer', 'pot_beta', 'β', 500, 440, {
      coefficient: potK1(BETA, TF),
    }),
  ]

  const cables = [
    // Signs
    c(1, 'lorenz2_x', 'out', 'lorenz2_inv_x', 'in'),
    c(2, 'lorenz2_z', 'out', 'lorenz2_inv_z', 'in'),

    // Ẋ: σ(Y − X) via SUM(X−Y) · pot σ into INT X
    c(3, 'lorenz2_inv_x', 'out', 'sum_dx', 'in0'),
    c(4, 'lorenz2_y', 'out', 'sum_dx', 'in1'),
    c(5, 'sum_dx', 'out', 'pot_sigma', 'in'),
    c(6, 'pot_sigma', 'out', 'lorenz2_x', 'in0'),

    // Products
    c(7, 'lorenz2_x', 'out', 'lorenz2_mult_xz', 'xp'),
    c(8, 'lorenz2_inv_z', 'out', 'lorenz2_mult_xz', 'yp'),
    c(9, 'lorenz2_x', 'out', 'lorenz2_mult_xy', 'xp'),
    c(10, 'lorenz2_y', 'out', 'lorenz2_mult_xy', 'yp'),

    // Ẏ: ρX − 10·XZ − Y
    c(11, 'lorenz2_inv_x', 'out', 'pot_rho', 'in'),
    c(12, 'pot_rho', 'out', 'lorenz2_y', 'in4'),
    c(13, 'lorenz2_mult_xz', 'out', 'lorenz2_y', 'in3'),
    c(14, 'lorenz2_y', 'out', 'pot_ydamp', 'in'),
    c(15, 'pot_ydamp', 'out', 'lorenz2_y', 'in0'),

    // Ż: 10·XY − βZ
    c(16, 'lorenz2_mult_xy', 'out', 'lorenz2_z', 'in3'),
    c(17, 'lorenz2_z', 'out', 'pot_beta', 'in'),
    c(18, 'pot_beta', 'out', 'lorenz2_z', 'in0'),
  ]

  let jumpers: JumperPlacement[] = defaultJumpers()
  for (const slot of [0, 1, 4]) {
    jumpers = upsertJumper(jumpers, {
      id: `jmode_${slot}`,
      kind: 'mode4',
      ampSlot: slot,
      position: 'integral',
    })
    jumpers = upsertJumper(jumpers, {
      id: `jtime_${slot}`,
      kind: 'time2',
      ampSlot: slot,
      position: '10',
    })
  }

  return baseSnapshot(nodes, cables, { jumpers })
}

export function loadLorenzAttractor2() {
  return fromSnapshot(lorenzAttractor2Snapshot())
}

export const LORENZ2_NODES = {
  x: 'lorenz2_x',
  y: 'lorenz2_y',
  z: 'lorenz2_z',
} as const

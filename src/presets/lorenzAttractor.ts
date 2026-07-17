import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import type { Cable, CircuitNode, CircuitSnapshot } from '../engine/types'

/**
 * Lorenz attractor — the classic butterfly, patched on the analog computer.
 *
 * Physical system (σ = 10, ρ = 28, β = 8/3):
 *   ẋ = σ(y − x)
 *   ẏ = ρx − x·z − y
 *   ż = x·y − β·z
 *
 * The Lorenz state runs well outside the ±10 V machine unit (x ≈ ±18,
 * y ≈ ±27, z ≈ 0…48), so it is amplitude-scaled onto voltages
 *   vX = x/Sx, vY = y/Sy, vZ = z/Sz  with  Sx = 2.5, Sy = 3.5, Sz = 6.
 *
 * Scaled voltage equations (what the patch actually integrates):
 *   v̇X = σ(Sy/Sx)·vY − σ·vX                 = 14·vY − 10·vX
 *   v̇Y = ρ(Sx/Sy)·vX − (Sx·Sz/Sy)·vX·vZ − vY = 20·vX − 4.2857·vX·vZ − vY
 *   v̇Z = (Sx·Sy/Sz)·vX·vY − β·vZ            = 1.4583·vX·vY − 2.6667·vZ
 *
 * Realisation notes for this engine:
 *   - Integrators/summers/inverters invert; the multiplier gives −(a·b)/10.
 *     Signs are handled with three inverters (−vX, −vY, −(vX·vZ)).
 *   - Each integrator runs at timeFactor 10 so the large σ/ρ gains fit as
 *     (pot k ≤ 1)·(input gain 1 or 10): effective coeff = 10·gain·k. The equal
 *     factor on all three integrators preserves the attractor's time scale.
 *   - Two quarter-square multipliers form the x·z and x·y products.
 *
 * Butterfly is displayed as the x–z projection on the X/Y scope.
 */

/** Amplitude scale factors (physical unit per volt). */
const SX = 2.5
const SY = 3.5
const SZ = 6

const SIGMA = 10
const RHO = 28
const BETA = 8 / 3
/** Common integrator time factor used to realise the large coefficients. */
const TF = 10

/** Coefficient → pot setting for a linear gain-10 integrator input. */
const k10 = (coeff: number) => coeff / TF / 10
/** Coefficient → pot setting for a linear gain-1 integrator input. */
const k1 = (coeff: number) => coeff / TF
/**
 * Coefficient → pot setting for a gain-10 input fed by a multiplier output.
 * The quarter-square multiplier already divides by the ±10 V machine unit, so
 * one factor of ten is pre-applied and the pot only needs coeff / TF.
 */
const kMul10 = (coeff: number) => coeff / TF

/** Classic initial condition (x, y, z) = (1, 1, 1), in scaled volts. */
const IC_X = 1 / SX
const IC_Y = 1 / SY
const IC_Z = 1 / SZ

export function lorenzAttractorSnapshot(): CircuitSnapshot {
  const nodes: CircuitNode[] = [
    createNode('reference', 'ref_p10', '+10 V', 40, 40, { voltage: 10 }),
    createNode('reference', 'ref_m10', '−10 V', 40, 120, { voltage: -10 }),
    createNode('reference', 'ref_gnd', 'Ground', 40, 200, { voltage: 0 }),

    createNode('integrator', 'lorenz_x', 'Int x', 360, 80, {
      initialCondition: IC_X,
      state: IC_X,
      timeFactor: TF,
    }),
    createNode('integrator', 'lorenz_y', 'Int y', 360, 260, {
      initialCondition: IC_Y,
      state: IC_Y,
      timeFactor: TF,
    }),
    createNode('integrator', 'lorenz_z', 'Int z', 360, 440, {
      initialCondition: IC_Z,
      state: IC_Z,
      timeFactor: TF,
    }),

    createNode('inverter', 'inv_x', '−x', 600, 80),
    createNode('inverter', 'inv_y', '−y', 600, 20),
    createNode('inverter', 'inv_mxz', '+xz', 600, 360),

    createNode('multiplier', 'mult_xz', 'x·z', 200, 360),
    createNode('multiplier', 'mult_xy', 'x·y', 200, 520),

    // ẋ = 14·vY − 10·vX  (−10·vX is x's own feedback into in0, gain 1)
    createNode('potentiometer', 'pot_xy', 'σ·Sy/Sx (y→x)', 500, 140, {
      coefficient: k10(SIGMA * (SY / SX)),
    }),
    // ẏ = 20·vX − 4.2857·vX·vZ − vY
    createNode('potentiometer', 'pot_yx', 'ρ·Sx/Sy (x→y)', 500, 200, {
      coefficient: k10(RHO * (SX / SY)),
    }),
    createNode('potentiometer', 'pot_yxz', 'Sx·Sz/Sy (xz→y)', 500, 320, {
      coefficient: kMul10((SX * SZ) / SY),
    }),
    createNode('potentiometer', 'pot_ydamp', '1/Sy·y decay', 500, 260, {
      coefficient: k1(1),
    }),
    // ż = 1.4583·vX·vY − 2.6667·vZ
    createNode('potentiometer', 'pot_zxy', 'Sx·Sy/Sz (xy→z)', 500, 500, {
      coefficient: kMul10((SX * SY) / SZ),
    }),
    createNode('potentiometer', 'pot_zdamp', 'β (z decay)', 500, 440, {
      coefficient: k1(BETA),
    }),
  ]

  const cables: Cable[] = [
    // Inverters produce the negated variables the sums need.
    c(1, 'lorenz_x', 'out', 'inv_x', 'in'), // inv_x = −vX
    c(2, 'lorenz_y', 'out', 'inv_y', 'in'), // inv_y = −vY
    c(3, 'mult_xz', 'out', 'inv_mxz', 'in'), // inv_mxz = +(vX·vZ)/10

    // Products (quarter-square multiplier: out = −(a·b)/10).
    c(4, 'lorenz_x', 'out', 'mult_xz', 'xp'),
    c(5, 'lorenz_z', 'out', 'mult_xz', 'yp'),
    c(6, 'lorenz_x', 'out', 'mult_xy', 'xp'),
    c(7, 'lorenz_y', 'out', 'mult_xy', 'yp'),

    // ẋ: −10·vX self-decay (gain-1 direct feedback) + 14·vY via −vY.
    c(8, 'lorenz_x', 'out', 'lorenz_x', 'in0'),
    c(9, 'inv_y', 'out', 'pot_xy', 'in'),
    c(10, 'pot_xy', 'out', 'lorenz_x', 'in3'),

    // ẏ: +20·vX via −vX, −4.2857·vX·vZ via +xz, −vY self-decay.
    c(11, 'inv_x', 'out', 'pot_yx', 'in'),
    c(12, 'pot_yx', 'out', 'lorenz_y', 'in3'),
    c(13, 'inv_mxz', 'out', 'pot_yxz', 'in'),
    c(14, 'pot_yxz', 'out', 'lorenz_y', 'in4'),
    c(15, 'lorenz_y', 'out', 'pot_ydamp', 'in'),
    c(16, 'pot_ydamp', 'out', 'lorenz_y', 'in0'),

    // ż: +1.4583·vX·vY via mult_xy (out is −(vX·vY)/10), −β·vZ self-decay.
    c(17, 'mult_xy', 'out', 'pot_zxy', 'in'),
    c(18, 'pot_zxy', 'out', 'lorenz_z', 'in3'),
    c(19, 'lorenz_z', 'out', 'pot_zdamp', 'in'),
    c(20, 'pot_zdamp', 'out', 'lorenz_z', 'in0'),
  ]

  return {
    nodes,
    cables,
    mode: 'ic',
    powered: true,
    timeScale: 1,
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

export function loadLorenzAttractor() {
  return fromSnapshot(lorenzAttractorSnapshot())
}

export const LORENZ_NODES = {
  x: 'lorenz_x',
  y: 'lorenz_y',
  z: 'lorenz_z',
} as const

/** X/Y scope: classic butterfly is the x–z projection (z on the vertical). */
export const LORENZ_SCOPE_CHANNELS = [
  {
    id: 'lorenzXZ',
    label: 'x–z',
    xNode: 'lorenz_x',
    yNode: 'lorenz_z',
    xScale: 1.25,
    yScale: 1.25,
    // Centre the z lobe (mean vZ ≈ 4) around the middle of the tube.
    yOffset: -5,
  },
] as const

import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import {
  equidistantX,
  FG_KNOB_COUNT,
  toEquidistantBreakpoints,
} from '../engine/functionGenerator'
import type { Breakpoint, CircuitNode } from '../engine/types'
import {
  baseSnapshot,
  cable as c,
  integratorNode,
  potK1,
  potK10,
  referenceNodes,
} from './helpers'

/**
 * Chua’s circuit — classic double-scroll chaos as an ODE patch.
 *
 * Physical system (α = 15.6, β = 28, m₀ = −1.143, m₁ = −0.714):
 *   ẋ = α(y − x − g(x))
 *   ẏ = x − y + z
 *   ż = −β y
 *
 * with the 3-segment Chua diode
 *   g(x) = m₁·x + ½(m₀−m₁)(|x+1| − |x−1|)
 *
 * Amplitude-scaled onto ±10 V with Sx = 0.5, Sy = 0.05, Sz = 0.5
 * (vX = x/Sx, …). Breakpoints of g land on FG knobs at ±2 V.
 *
 * Scaled voltage equations:
 *   v̇X = 1.56·vY − 15.6·vX − 31.2·g(Sx·vX)
 *   v̇Y = 10·vX − vY + 10·vZ
 *   v̇Z = −2.8·vY
 *
 * F1 is programmed as FG(vX) = g(Sx·vX). Integrators run at timeFactor 10
 * so the large α / α/Sx gains fit as pot·gain products. No multipliers —
 * classic Chua is piecewise-linear.
 *
 * Double-scroll is displayed as the x–y projection on the X/Y scope.
 */

const SX = 0.5
const SY = 0.05
const SZ = 0.5

const ALPHA = 15.6
const BETA = 28
const M0 = -1.143
const M1 = -0.714
const TF = 10

/** Physical IC near the attractor; scaled to volts. */
const IC_X = 0.1 / SX
const IC_Y = 0.1 / SY
const IC_Z = 0.1 / SZ

/** Classic 3-segment Chua diode (breakpoint at ±1). */
export function chuaDiode(x: number): number {
  return M1 * x + 0.5 * (M0 - M1) * (Math.abs(x + 1) - Math.abs(x - 1))
}

/** F1 table: FG(v) = g(Sx·v) on the museum 21-knob equidistant grid. */
export function chuaDiodeBreakpoints(): Breakpoint[] {
  const raw: Breakpoint[] = Array.from({ length: FG_KNOB_COUNT }, (_, i) => {
    const v = equidistantX(i)
    return { x: v, y: chuaDiode(SX * v) }
  })
  return toEquidistantBreakpoints(raw)
}

export function chuaCircuitSnapshot() {
  const nodes: CircuitNode[] = [
    ...referenceNodes(),

    integratorNode('chua_x', 'Int x', 360, 80, IC_X, { timeFactor: TF }),
    integratorNode('chua_y', 'Int y', 360, 260, IC_Y, { timeFactor: TF }),
    integratorNode('chua_z', 'Int z', 360, 440, IC_Z, { timeFactor: TF }),

    createNode('inverter', 'inv_x', '−x', 600, 80),
    createNode('inverter', 'inv_y', '−y', 600, 200),
    createNode('inverter', 'inv_z', '−z', 600, 440),

    // F1 — piecewise-linear Chua diode (faceplate knobs)
    createNode('functionGenerator', 'fg_1', 'Chua diode g(x)', 200, 80, {
      breakpoints: chuaDiodeBreakpoints(),
    }),

    // v̇X = 1.56·vY − 15.6·vX − 31.2·FG
    createNode('potentiometer', 'pot_xy', 'α·Sy/Sx (y→x)', 500, 140, {
      coefficient: potK1(ALPHA * (SY / SX), TF),
    }),
    createNode('potentiometer', 'pot_xdamp', 'α (x decay)', 500, 80, {
      coefficient: potK10(ALPHA, TF),
    }),
    createNode('potentiometer', 'pot_xg', 'α/Sx (g→x)', 500, 200, {
      coefficient: potK10(ALPHA / SX, TF),
    }),

    // v̇Y = 10·vX − vY + 10·vZ
    createNode('potentiometer', 'pot_yx', 'Sx/Sy (x→y)', 500, 280, {
      coefficient: potK1(SX / SY, TF),
    }),
    createNode('potentiometer', 'pot_ydamp', '1 (y decay)', 500, 320, {
      coefficient: potK1(1, TF),
    }),
    createNode('potentiometer', 'pot_yz', 'Sz/Sy (z→y)', 500, 360, {
      coefficient: potK1(SZ / SY, TF),
    }),

    // v̇Z = −2.8·vY
    createNode('potentiometer', 'pot_zy', 'β·Sy/Sz (y→z)', 500, 460, {
      coefficient: potK1(BETA * (SY / SZ), TF),
    }),
  ]

  const cables = [
    c(1, 'chua_x', 'out', 'inv_x', 'in'),
    c(2, 'chua_y', 'out', 'inv_y', 'in'),
    c(3, 'chua_z', 'out', 'inv_z', 'in'),
    c(4, 'chua_x', 'out', 'fg_1', 'in'),

    // v̇X: −α·vX (self), +α·Sy/Sx·vY via −vY, −(α/Sx)·g via +FG
    c(5, 'chua_x', 'out', 'pot_xdamp', 'in'),
    c(6, 'pot_xdamp', 'out', 'chua_x', 'in3'),
    c(7, 'inv_y', 'out', 'pot_xy', 'in'),
    c(8, 'pot_xy', 'out', 'chua_x', 'in0'),
    c(9, 'fg_1', 'out', 'pot_xg', 'in'),
    c(10, 'pot_xg', 'out', 'chua_x', 'in4'),

    // v̇Y: +10·vX via −vX, −vY self-decay, +10·vZ via −vZ
    c(11, 'inv_x', 'out', 'pot_yx', 'in'),
    c(12, 'pot_yx', 'out', 'chua_y', 'in0'),
    c(13, 'chua_y', 'out', 'pot_ydamp', 'in'),
    c(14, 'pot_ydamp', 'out', 'chua_y', 'in1'),
    c(15, 'inv_z', 'out', 'pot_yz', 'in'),
    c(16, 'pot_yz', 'out', 'chua_y', 'in2'),

    // v̇Z: −β·Sy/Sz·vY
    c(17, 'chua_y', 'out', 'pot_zy', 'in'),
    c(18, 'pot_zy', 'out', 'chua_z', 'in0'),
  ]

  return baseSnapshot(nodes, cables, { timeScale: 1.5 })
}

export function loadChuaCircuit() {
  return fromSnapshot(chuaCircuitSnapshot())
}

export const CHUA_NODES = {
  x: 'chua_x',
  y: 'chua_y',
  z: 'chua_z',
  fg: 'fg_1',
} as const

/** X/Y scope: classic double-scroll is the x–y projection. */
export const CHUA_SCOPE_CHANNELS = [
  {
    id: 'chuaXY',
    label: 'Chua · x–y',
    title: 'X/Y scope — Chua’s circuit (x–y double scroll)',
    xNode: 'chua_x',
    yNode: 'chua_y',
    xScale: 1.4,
    yScale: 1.1,
    persistSec: 8,
  },
] as const

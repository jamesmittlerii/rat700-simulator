import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import {
  equidistantX,
  FG_KNOB_COUNT,
  toEquidistantBreakpoints,
} from '../engine/functionGenerator'
import type { Breakpoint, Cable, CircuitNode } from '../engine/types'
import {
  baseSnapshot,
  cable,
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

const STATE = {
  x: { id: 'chua_x', ic: 0.1 / SX, y: 80 },
  y: { id: 'chua_y', ic: 0.1 / SY, y: 260 },
  z: { id: 'chua_z', ic: 0.1 / SZ, y: 440 },
} as const

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

type PotSpec = {
  readonly id: string
  readonly label: string
  readonly y: number
  readonly k: number
}

type Link = {
  readonly from: string
  readonly fromPort: string
  readonly to: string
  readonly toPort: string
}

function potNodes(specs: readonly PotSpec[]): CircuitNode[] {
  return specs.map((p) =>
    createNode('potentiometer', p.id, p.label, 500, p.y, {
      coefficient: p.k,
    }),
  )
}

function wire(links: readonly Link[]): Cable[] {
  return links.map((l, i) => cable(i + 1, l.from, l.fromPort, l.to, l.toPort))
}

function stateIntegrators(): CircuitNode[] {
  return (['x', 'y', 'z'] as const).map((axis) => {
    const s = STATE[axis]
    return integratorNode(s.id, `Int ${axis}`, 360, s.y, s.ic, {
      timeFactor: TF,
    })
  })
}

function stateInverters(): CircuitNode[] {
  return (['x', 'y', 'z'] as const).map((axis) => {
    const s = STATE[axis]
    return createNode('inverter', `inv_${axis}`, `−${axis}`, 600, s.y)
  })
}

/** Coefficient pots for the scaled Chua equations. */
function chuaPots(): CircuitNode[] {
  return potNodes([
    {
      id: 'pot_xy',
      label: 'α·Sy/Sx (y→x)',
      y: 140,
      k: potK1(ALPHA * (SY / SX), TF),
    },
    { id: 'pot_xdamp', label: 'α (x decay)', y: 80, k: potK10(ALPHA, TF) },
    {
      id: 'pot_xg',
      label: 'α/Sx (g→x)',
      y: 200,
      k: potK10(ALPHA / SX, TF),
    },
    { id: 'pot_yx', label: 'Sx/Sy (x→y)', y: 280, k: potK1(SX / SY, TF) },
    { id: 'pot_ydamp', label: '1 (y decay)', y: 320, k: potK1(1, TF) },
    { id: 'pot_yz', label: 'Sz/Sy (z→y)', y: 360, k: potK1(SZ / SY, TF) },
    {
      id: 'pot_zy',
      label: 'β·Sy/Sz (y→z)',
      y: 460,
      k: potK1(BETA * (SY / SZ), TF),
    },
  ])
}

/**
 * Patch graph:
 *   x → F1(g) → pot_xg → ∫x;  −y → pot_xy → ∫x;  x → pot_xdamp → ∫x
 *   −x → pot_yx → ∫y;  y → pot_ydamp → ∫y;  −z → pot_yz → ∫y
 *   y → pot_zy → ∫z
 */
function chuaLinks(): Link[] {
  const { x, y, z } = STATE
  return [
    { from: x.id, fromPort: 'out', to: 'inv_x', toPort: 'in' },
    { from: y.id, fromPort: 'out', to: 'inv_y', toPort: 'in' },
    { from: z.id, fromPort: 'out', to: 'inv_z', toPort: 'in' },
    { from: x.id, fromPort: 'out', to: 'fg_1', toPort: 'in' },

    { from: x.id, fromPort: 'out', to: 'pot_xdamp', toPort: 'in' },
    { from: 'pot_xdamp', fromPort: 'out', to: x.id, toPort: 'in3' },
    { from: 'inv_y', fromPort: 'out', to: 'pot_xy', toPort: 'in' },
    { from: 'pot_xy', fromPort: 'out', to: x.id, toPort: 'in0' },
    { from: 'fg_1', fromPort: 'out', to: 'pot_xg', toPort: 'in' },
    { from: 'pot_xg', fromPort: 'out', to: x.id, toPort: 'in4' },

    { from: 'inv_x', fromPort: 'out', to: 'pot_yx', toPort: 'in' },
    { from: 'pot_yx', fromPort: 'out', to: y.id, toPort: 'in0' },
    { from: y.id, fromPort: 'out', to: 'pot_ydamp', toPort: 'in' },
    { from: 'pot_ydamp', fromPort: 'out', to: y.id, toPort: 'in1' },
    { from: 'inv_z', fromPort: 'out', to: 'pot_yz', toPort: 'in' },
    { from: 'pot_yz', fromPort: 'out', to: y.id, toPort: 'in2' },

    { from: y.id, fromPort: 'out', to: 'pot_zy', toPort: 'in' },
    { from: 'pot_zy', fromPort: 'out', to: z.id, toPort: 'in0' },
  ]
}

export function chuaCircuitSnapshot() {
  const nodes: CircuitNode[] = [
    ...referenceNodes(),
    ...stateIntegrators(),
    ...stateInverters(),
    createNode('functionGenerator', 'fg_1', 'Chua diode g(x)', 200, 80, {
      breakpoints: chuaDiodeBreakpoints(),
    }),
    ...chuaPots(),
  ]
  return baseSnapshot(nodes, wire(chuaLinks()), { timeScale: 1.5 })
}

export function loadChuaCircuit() {
  return fromSnapshot(chuaCircuitSnapshot())
}

export const CHUA_NODES = {
  x: STATE.x.id,
  y: STATE.y.id,
  z: STATE.z.id,
  fg: 'fg_1',
} as const

/** X/Y scope: classic double-scroll is the x–y projection. */
export const CHUA_SCOPE_CHANNELS = [
  {
    id: 'chuaXY',
    label: 'Chua · x–y',
    title: 'X/Y scope — Chua’s circuit (x–y double scroll)',
    xNode: STATE.x.id,
    yNode: STATE.y.id,
    xScale: 1.4,
    yScale: 1.1,
    persistSec: 8,
  },
] as const

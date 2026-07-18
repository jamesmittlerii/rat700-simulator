/**
 * Shared builders for schematic presets — keeps cable / rail / snapshot
 * boilerplate out of each attractor file.
 */

import { createNode } from '../engine/elements'
import type { Cable, CircuitNode, CircuitSnapshot } from '../engine/types'

/** Numbered cable used by schematic presets. */
export function cable(
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

export interface ReferenceOrigin {
  readonly x?: number
  readonly y?: number
  readonly dy?: number
}

/** Standard ±10 V / ground rail. Defaults match schematic presets. */
export function referenceNodes(origin: ReferenceOrigin = {}): CircuitNode[] {
  const x = origin.x ?? 40
  const y = origin.y ?? 40
  const dy = origin.dy ?? 80
  return [
    createNode('reference', 'ref_p10', '+10 V', x, y, { voltage: 10 }),
    createNode('reference', 'ref_m10', '−10 V', x, y + dy, { voltage: -10 }),
    createNode('reference', 'ref_gnd', 'Ground', x, y + 2 * dy, { voltage: 0 }),
  ]
}

/** Snapshot fields shared by every preset. */
export function baseSnapshot(
  nodes: CircuitNode[],
  cables: Cable[],
  extras?: Partial<
    Pick<CircuitSnapshot, 'timeScale' | 'jumpers' | 'mode' | 'powered' | 'panelButton'>
  >,
): CircuitSnapshot {
  return {
    nodes,
    cables,
    mode: 'ic',
    powered: true,
    timeScale: 1,
    time: 0,
    panelButton: 'pause',
    ...extras,
  }
}

/** Linear coeff → pot for a gain-1 integrator input at timeFactor `tf`. */
export function potK1(coeff: number, tf: number): number {
  return coeff / tf
}

/** Linear coeff → pot for a gain-10 integrator input at timeFactor `tf`. */
export function potK10(coeff: number, tf: number): number {
  return coeff / tf / 10
}

/**
 * Coeff → pot for a gain-10 input fed by a multiplier output.
 * The quarter-square multiplier already divides by the machine unit.
 */
export function potKMul10(coeff: number, tf: number): number {
  return coeff / tf
}

/** Integrator with matching initialCondition and state. */
export function integratorNode(
  id: string,
  label: string,
  x: number,
  y: number,
  ic: number,
  extras?: Partial<CircuitNode>,
): CircuitNode {
  return createNode('integrator', id, label, x, y, {
    initialCondition: ic,
    state: ic,
    ...extras,
  })
}

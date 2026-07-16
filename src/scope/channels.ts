import type { CircuitNode } from '../engine/types'
import { VEHICLE_SCOPE_CHANNELS } from '../presets/vehicleSuspension'

export interface ScopeChannel {
  id: string
  label: string
  xNode: string
  yNode: string
}

/** Harmonic oscillator: X/Y orbit from the two integrators. */
export const OSCILLATOR_SCOPE_CHANNELS: ScopeChannel[] = [
  { id: 'orbit', label: 'x–y', xNode: 'int_1', yNode: 'int_2' },
]

/**
 * Pick X/Y mux channels for the current patch.
 * Vehicle figure generator wins when present; else classic oscillator orbit.
 */
export function scopeChannelsFor(nodes: CircuitNode[]): ScopeChannel[] {
  const ids = new Set(nodes.map((n) => n.id))
  if (ids.has('sum_xL') && ids.has('sum_yw')) {
    return [...VEHICLE_SCOPE_CHANNELS]
  }
  if (ids.has('int_1') && ids.has('int_2')) {
    return OSCILLATOR_SCOPE_CHANNELS
  }
  return []
}

export function hasXYScope(nodes: CircuitNode[]): boolean {
  return scopeChannelsFor(nodes).length > 0
}

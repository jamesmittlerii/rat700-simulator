import type { CircuitNode } from '../engine/types'
import { VEHICLE_SCOPE_CHANNELS } from '../presets/vehicleSuspension'
import { LORENZ_SCOPE_CHANNELS } from '../presets/lorenzAttractor'
import { ROSSLER_SCOPE_CHANNELS } from '../presets/rosslerAttractor'
import { VAN_DER_POL_SCOPE_CHANNELS } from '../presets/vanDerPol'
import { MATHIEU_SCOPE_CHANNELS } from '../presets/mathieuEquation'
import { DUFFING_SCOPE_CHANNELS } from '../presets/duffingOscillator'

export interface ScopeChannel {
  id: string
  label: string
  xNode: string
  yNode: string
  xScale?: number
  yScale?: number
  xOffset?: number
  yOffset?: number
  /**
   * Rigid-body bounce / mix terms added after scale+offset (full 1:1 unless
   * yAddScale is set). Keeps roof and sill locked during body motion.
   */
  yAddNodes?: readonly string[]
  yAddScale?: number
  /**
   * Optional phosphor persistence at timeScale 1× (machine seconds).
   * The scope multiplies by the live timeScale so trail length tracks the knob.
   */
  persistSec?: number
  /** Optional scope header title. */
  title?: string
}

/** Harmonic oscillator: X/Y orbit from the two integrators. */
export const OSCILLATOR_SCOPE_CHANNELS: ScopeChannel[] = [
  { id: 'orbit', label: 'x–y', xNode: 'int_1', yNode: 'int_2' },
]

/**
 * Pick X/Y mux channels for the current patch.
 * Vehicle figure generator wins when present; then Lorenz butterfly; else the
 * classic oscillator orbit.
 */
export function scopeChannelsFor(nodes: CircuitNode[]): ScopeChannel[] {
  const ids = new Set(nodes.map((n) => n.id))
  if (ids.has('sum_xL') && ids.has('sum_yw')) {
    return [...VEHICLE_SCOPE_CHANNELS]
  }
  if (ids.has('lorenz_x') && ids.has('lorenz_z')) {
    return [...LORENZ_SCOPE_CHANNELS]
  }
  if (ids.has('ross_x') && ids.has('ross_y')) {
    return [...ROSSLER_SCOPE_CHANNELS]
  }
  if (ids.has('vdp_x') && ids.has('vdp_v')) {
    return [...VAN_DER_POL_SCOPE_CHANNELS]
  }
  if (ids.has('mathieu_x') && ids.has('mathieu_v')) {
    return [...MATHIEU_SCOPE_CHANNELS]
  }
  if (ids.has('duffing_x') && ids.has('duffing_v')) {
    return [...DUFFING_SCOPE_CHANNELS]
  }
  if (ids.has('int_1') && ids.has('int_2')) {
    return OSCILLATOR_SCOPE_CHANNELS
  }
  return []
}

export function hasXYScope(nodes: CircuitNode[]): boolean {
  return scopeChannelsFor(nodes).length > 0
}

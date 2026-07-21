import type { CircuitNode } from '../engine/types'
import { VEHICLE_SCOPE_CHANNELS } from '../presets/vehicleSuspension'
import { LORENZ_SCOPE_CHANNELS } from '../presets/lorenzAttractor'
import { ROSSLER_SCOPE_CHANNELS } from '../presets/rosslerAttractor'
import { VAN_DER_POL_SCOPE_CHANNELS } from '../presets/vanDerPol'
import { MATHIEU_SCOPE_CHANNELS } from '../presets/mathieuEquation'
import { DUFFING_SCOPE_CHANNELS } from '../presets/duffingOscillator'
import { SOFT_SPRING_SCOPE_CHANNELS } from '../presets/softSpringThreeBody'
import { CHUA_SCOPE_CHANNELS } from '../presets/chuaCircuit'

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
 * First matching pair of node ids wins. Order matters: vehicle figure
 * generator before chaos / oscillator orbits. Channels are resolved via
 * getters so circular preset↔channels imports stay lazy.
 */
const SCOPE_MATCHERS: readonly {
  readonly a: string
  readonly b: string
  readonly channels: () => readonly ScopeChannel[]
}[] = [
  { a: 'sum_xL', b: 'sum_yw', channels: () => VEHICLE_SCOPE_CHANNELS },
  { a: 'lorenz_x', b: 'lorenz_z', channels: () => LORENZ_SCOPE_CHANNELS },
  { a: 'ross_x', b: 'ross_y', channels: () => ROSSLER_SCOPE_CHANNELS },
  { a: 'vdp_x', b: 'vdp_v', channels: () => VAN_DER_POL_SCOPE_CHANNELS },
  { a: 'mathieu_x', b: 'mathieu_v', channels: () => MATHIEU_SCOPE_CHANNELS },
  { a: 'duffing_x', b: 'duffing_v', channels: () => DUFFING_SCOPE_CHANNELS },
  { a: 'ss3_xA', b: 'ss3_yA', channels: () => SOFT_SPRING_SCOPE_CHANNELS },
  { a: 'chua_x', b: 'chua_y', channels: () => CHUA_SCOPE_CHANNELS },
  { a: 'int_1', b: 'int_2', channels: () => OSCILLATOR_SCOPE_CHANNELS },
]

/**
 * Pick X/Y mux channels for the current patch.
 * Vehicle figure generator wins when present; then Lorenz butterfly; else the
 * classic oscillator orbit.
 */
export function scopeChannelsFor(nodes: CircuitNode[]): ScopeChannel[] {
  const ids = new Set(nodes.map((n) => n.id))
  for (const { a, b, channels } of SCOPE_MATCHERS) {
    if (ids.has(a) && ids.has(b)) return [...channels()]
  }
  return []
}

export function hasXYScope(nodes: CircuitNode[]): boolean {
  return scopeChannelsFor(nodes).length > 0
}

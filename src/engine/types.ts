/** Machine operating modes (English labels in UI). */
export type MachineMode = 'potSet' | 'ic' | 'operate' | 'hold'

export type ElementKind =
  | 'reference'
  | 'potentiometer'
  | 'summer'
  | 'integrator'
  | 'inverter'
  /** External excitation (road bumps / noise), like a noise generator. */
  | 'signal'
  /** Variable diode function generator (piecewise linear). */
  | 'functionGenerator'

export type SignalWaveform = 'road' | 'sine'

export interface Breakpoint {
  x: number
  y: number
}

export type PortDirection = 'in' | 'out'

export type InputGain = number

export interface PortRef {
  nodeId: string
  port: string
}

export interface Cable {
  id: string
  from: PortRef
  to: PortRef
}

export interface CircuitNode {
  id: string
  kind: ElementKind
  label: string
  x: number
  y: number
  /** Potentiometer coefficient k in [0, 1]. */
  coefficient?: number
  /** Reference voltage (+10, -10, or 0). */
  voltage?: number
  /** Integrator state (output voltage). */
  state?: number
  /** Default IC when no IC jack is patched. */
  initialCondition?: number
  /** Per-input gains for summer/integrator (port name → gain). */
  inputGains?: Record<string, InputGain>
  /** Signal generator waveform. */
  waveform?: SignalWaveform
  /** Signal amplitude in volts (peak). */
  amplitude?: number
  /** Signal frequency / noise bandwidth in rad/s (machine time). */
  frequency?: number
  /** Diode function-generator breakpoints. */
  breakpoints?: Breakpoint[]
}

export interface CircuitSnapshot {
  nodes: CircuitNode[]
  cables: Cable[]
  mode: MachineMode
  powered: boolean
  timeScale: number
  time: number
}

export interface PortDef {
  name: string
  direction: PortDirection
  /** Display / jack color hint. */
  jack: 'green' | 'orange' | 'red' | 'blue' | 'black' | 'yellow'
  label?: string
}

export const MACHINE_UNIT = 10
export const OVERLOAD_THRESHOLD = 10.5
/** RA 741–class budget so suspension + X/Y figure generator fit. */
export const MAX_AMPLIFIERS = 36
export const MAX_POTENTIOMETERS = 40
export const MAX_FUNCTION_GENERATORS = 2

export function portKey(ref: PortRef): string {
  return `${ref.nodeId}:${ref.port}`
}

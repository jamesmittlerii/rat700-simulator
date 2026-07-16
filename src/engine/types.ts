/** Machine operating modes (English labels in UI). */
export type MachineMode = 'potSet' | 'ic' | 'operate' | 'hold'

/** Six interlocked control-panel buttons (German faceplate). */
export type PanelButton =
  | 'pause'
  | 'dauer'
  | 'halt'
  | 'potSet'
  | 'einmal'
  | 'fremd'

/** Integrator time-constant factor from 2-pin jumper (1 / 10 / 100 s⁻¹). */
export type TimeFactor = 1 | 10 | 100

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
  /** Four-quadrant parabolic (quarter-square) multiplier. */
  | 'multiplier'

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
  /** Structural patch-cord color override. */
  color?: string
}

/** 4-pin Umschaltstecker or 2-pin time-constant short on config rows. */
export type JumperKind = 'mode4' | 'time2'

export interface JumperPlacement {
  id: string
  kind: JumperKind
  /** Amplifier slot index 0–7 for switchable Σ/∫ blocks. */
  ampSlot: number
  /**
   * mode4: 'sigma' = rows a–b (summer), 'integral' = rows b–c (integrator).
   * time2: '1' = rows c–d, '10' = rows d–e.
   */
  position: 'sigma' | 'integral' | '1' | '10'
}

export interface AmpConfig {
  mode: 'summer' | 'integrator'
  timeFactor: TimeFactor
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
  /** Integrator time-constant factor from jumper (default 1). */
  timeFactor?: TimeFactor
  /** Signal generator waveform. */
  waveform?: SignalWaveform
  /** Signal amplitude in volts (peak). */
  amplitude?: number
  /** Signal frequency / noise bandwidth in rad/s (machine time). */
  frequency?: number
  /** Diode function-generator breakpoints. */
  breakpoints?: Breakpoint[]
  /** Faceplate amplifier slot (0–14) when mapped to Programmierfeld. */
  ampSlot?: number
}

export interface CircuitSnapshot {
  nodes: CircuitNode[]
  cables: Cable[]
  mode: MachineMode
  powered: boolean
  timeScale: number
  time: number
  jumpers?: JumperPlacement[]
  panelButton?: PanelButton
  masterRef?: number
  calibratePotId?: string | null
  autoShutdown?: boolean
  stepsPerFrame?: number
  externalSlave?: boolean
}

export interface PortDef {
  name: string
  direction: PortDirection
  /** Display / jack color hint (RAT 700 Programmierfeld coding). */
  jack: 'green' | 'orange' | 'red' | 'blue' | 'black' | 'yellow' | 'white' | 'brown'
  label?: string
}

export const MACHINE_UNIT = 10
export const OVERLOAD_THRESHOLD = 10.5
/** RA 741–class budget so suspension + X/Y figure generator fit. */
export const MAX_AMPLIFIERS = 36
export const MAX_POTENTIOMETERS = 40
export const MAX_FUNCTION_GENERATORS = 2
export const MAX_MULTIPLIERS = 4
/** Default fixed RK4 substeps per animation frame when not scope-driven. */
export const DEFAULT_STEPS_PER_FRAME = 8

export function portKey(ref: PortRef): string {
  return `${ref.nodeId}:${ref.port}`
}

export function panelButtonToMode(button: PanelButton): MachineMode {
  switch (button) {
    case 'pause':
      return 'ic'
    case 'dauer':
    case 'einmal':
      return 'operate'
    case 'halt':
      return 'hold'
    case 'potSet':
      return 'potSet'
    case 'fremd':
      return 'hold'
  }
}

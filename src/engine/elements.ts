import type {
  CircuitNode,
  ElementKind,
  InputGain,
  PortDef,
  TimeFactor,
} from './types'
import { MACHINE_UNIT } from './types'
import { defaultFgBreakpoints } from './functionGenerator'

export { signalOutput } from './roadNoise'

/**
 * Port definitions for each element kind.
 * Summer/integrator expose RAT pad ports: e,f,g (gain 1), h,i (gain 10), k (S),
 * plus legacy in0/in1/in2 aliases for schematic presets.
 */
export function portsFor(kind: ElementKind, node?: CircuitNode): PortDef[] {
  switch (kind) {
    case 'reference': {
      const v = node?.voltage ?? MACHINE_UNIT
      const jack = v > 0 ? 'red' : v < 0 ? 'blue' : 'black'
      return [{ name: 'out', direction: 'out', jack, label: 'Out' }]
    }
    case 'potentiometer':
      return [
        { name: 'in', direction: 'in', jack: 'green', label: 'In' },
        { name: 'low', direction: 'in', jack: 'green', label: 'Low' },
        { name: 'out', direction: 'out', jack: 'orange', label: 'Out' },
      ]
    case 'inverter':
      return [
        { name: 'in', direction: 'in', jack: 'green', label: 'In' },
        { name: 'out', direction: 'out', jack: 'red', label: 'Out' },
      ]
    case 'summer':
      return [
        { name: 'in0', direction: 'in', jack: 'green', label: 'In1 (e)' },
        { name: 'in1', direction: 'in', jack: 'green', label: 'In2 (f)' },
        { name: 'in2', direction: 'in', jack: 'green', label: 'In3 (g)' },
        { name: 'in3', direction: 'in', jack: 'green', label: 'In4 (h×10)' },
        { name: 'in4', direction: 'in', jack: 'green', label: 'In5 (i×10)' },
        { name: 's', direction: 'in', jack: 'white', label: 'S (k)' },
        { name: 'r', direction: 'in', jack: 'white', label: 'R' },
        { name: 'g', direction: 'in', jack: 'white', label: 'G' },
        { name: 'out', direction: 'out', jack: 'red', label: 'Out' },
      ]
    case 'integrator':
      return [
        { name: 'in0', direction: 'in', jack: 'green', label: 'In1 (e)' },
        { name: 'in1', direction: 'in', jack: 'green', label: 'In2 (f)' },
        { name: 'in2', direction: 'in', jack: 'green', label: 'In3 (g)' },
        { name: 'in3', direction: 'in', jack: 'green', label: 'In4 (h×10)' },
        { name: 'in4', direction: 'in', jack: 'green', label: 'In5 (i×10)' },
        { name: 's', direction: 'in', jack: 'white', label: 'S (k)' },
        { name: 'ic', direction: 'in', jack: 'white', label: 'IC (A)' },
        { name: 'out', direction: 'out', jack: 'red', label: 'Out' },
      ]
    case 'signal':
      return [{ name: 'out', direction: 'out', jack: 'yellow', label: 'Out' }]
    case 'functionGenerator':
      return [
        { name: 'in', direction: 'in', jack: 'green', label: 'In' },
        { name: 'out', direction: 'out', jack: 'orange', label: 'Out' },
      ]
    case 'multiplier':
      return [
        { name: 'xp', direction: 'in', jack: 'green', label: '+X' },
        { name: 'xm', direction: 'in', jack: 'green', label: '−X' },
        { name: 'yp', direction: 'in', jack: 'green', label: '+Y' },
        { name: 'ym', direction: 'in', jack: 'green', label: '−Y' },
        { name: 'g', direction: 'out', jack: 'white', label: 'G' },
        { name: 'out', direction: 'out', jack: 'red', label: 'Out' },
      ]
  }
}

export function defaultInputGains(kind: ElementKind): Record<string, InputGain> {
  if (kind === 'summer' || kind === 'integrator') {
    return { in0: 1, in1: 1, in2: 1, in3: 10, in4: 10, s: 1 }
  }
  return {}
}

export function createNode(
  kind: ElementKind,
  id: string,
  label: string,
  x: number,
  y: number,
  extras: Partial<CircuitNode> = {},
): CircuitNode {
  const base: CircuitNode = {
    id,
    kind,
    label,
    x,
    y,
    inputGains: defaultInputGains(kind),
  }
  switch (kind) {
    case 'reference':
      return { ...base, voltage: MACHINE_UNIT, ...extras }
    case 'potentiometer':
      return { ...base, coefficient: 0.5, ...extras }
    case 'integrator':
      return {
        ...base,
        state: 0,
        initialCondition: 0,
        timeFactor: 1,
        ...extras,
      }
    case 'signal':
      return {
        ...base,
        waveform: 'road',
        amplitude: 1.5,
        frequency: 2.2,
        ...extras,
      }
    case 'functionGenerator':
      return {
        ...base,
        breakpoints: extras.breakpoints ?? defaultFgBreakpoints(),
        ...extras,
      }
    default:
      return { ...base, ...extras }
  }
}

/** Inverting summer: out = −Σ(gain_i × in_i). */
export function summerOutput(inputs: number[], gains: number[]): number {
  let sum = 0
  for (let i = 0; i < inputs.length; i++) {
    sum += (gains[i] ?? 1) * (inputs[i] ?? 0)
  }
  return -sum
}

/**
 * Integrator derivative: d(out)/dt = −timeFactor · Σ(gain_i × in_i).
 * timeFactor comes from capacitor jumpers (1 / 10 / 100 s⁻¹).
 */
export function integratorDerivative(
  inputs: number[],
  gains: number[],
  timeFactor: TimeFactor = 1,
): number {
  return timeFactor * summerOutput(inputs, gains)
}

/** Potentiometer: out = k × in (grounded low-side by default). */
export function potOutput(input: number, k: number): number {
  const coeff = Math.min(1, Math.max(0, k))
  return coeff * input
}

/** Inverter: out = −in. */
export function inverterOutput(input: number): number {
  return -input
}

/** Effective bipolar input from +/− jack pair. */
export function bipolarInput(positive: number, negative: number): number {
  if (positive !== 0 && negative !== 0) return positive - negative
  if (negative !== 0) return -negative
  return positive
}

/**
 * Parabolic / quarter-square multiplier: out ≈ −(x · y) / E
 * where E is the machine unit (±10 V).
 */
export function multiplierOutput(
  x: number,
  y: number,
  machineUnit: number = MACHINE_UNIT,
): number {
  const e = machineUnit === 0 ? MACHINE_UNIT : machineUnit
  return -(x * y) / e
}

export function isAmplifier(kind: ElementKind): boolean {
  return (
    kind === 'summer' ||
    kind === 'integrator' ||
    kind === 'inverter' ||
    kind === 'functionGenerator'
  )
}

export function countAmplifiers(nodes: CircuitNode[]): number {
  return nodes.filter((n) => isAmplifier(n.kind)).length
}

export function countPots(nodes: CircuitNode[]): number {
  return nodes.filter((n) => n.kind === 'potentiometer').length
}

export function countMultipliers(nodes: CircuitNode[]): number {
  return nodes.filter((n) => n.kind === 'multiplier').length
}

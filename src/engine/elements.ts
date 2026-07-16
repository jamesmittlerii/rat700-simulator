import type { CircuitNode, ElementKind, InputGain, PortDef } from './types'
import { MACHINE_UNIT } from './types'

export { signalOutput } from './roadNoise'

/** Port definitions for each element kind. */
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
        { name: 'out', direction: 'out', jack: 'orange', label: 'Out' },
      ]
    case 'inverter':
      return [
        { name: 'in', direction: 'in', jack: 'green', label: 'In' },
        { name: 'out', direction: 'out', jack: 'orange', label: 'Out' },
      ]
    case 'summer':
      return [
        { name: 'in0', direction: 'in', jack: 'green', label: 'In1' },
        { name: 'in1', direction: 'in', jack: 'green', label: 'In2' },
        { name: 'in2', direction: 'in', jack: 'green', label: 'In3' },
        { name: 'out', direction: 'out', jack: 'orange', label: 'Out' },
      ]
    case 'integrator':
      return [
        { name: 'in0', direction: 'in', jack: 'green', label: 'In1' },
        { name: 'in1', direction: 'in', jack: 'green', label: 'In2' },
        { name: 'ic', direction: 'in', jack: 'yellow', label: 'IC' },
        { name: 'out', direction: 'out', jack: 'orange', label: 'Out' },
      ]
    case 'signal':
      return [{ name: 'out', direction: 'out', jack: 'yellow', label: 'Out' }]
    case 'functionGenerator':
      return [
        { name: 'in', direction: 'in', jack: 'green', label: 'In' },
        { name: 'out', direction: 'out', jack: 'orange', label: 'Out' },
      ]
  }
}

export function defaultInputGains(kind: ElementKind): Record<string, InputGain> {
  if (kind === 'summer' || kind === 'integrator') {
    return { in0: 1, in1: 1, in2: 1 }
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
      return { ...base, state: 0, initialCondition: 0, ...extras }
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
        breakpoints: extras.breakpoints ?? [
          { x: -10, y: -10 },
          { x: 10, y: 10 },
        ],
        ...extras,
      }
    default:
      return { ...base, ...extras }
  }
}

/** Inverting summer: out = −Σ(gain_i × in_i). */
export function summerOutput(
  inputs: number[],
  gains: number[],
): number {
  let sum = 0
  for (let i = 0; i < inputs.length; i++) {
    sum += (gains[i] ?? 1) * (inputs[i] ?? 0)
  }
  return -sum
}

/** Integrator derivative: d(out)/dt = −Σ(gain_i × in_i). */
export function integratorDerivative(
  inputs: number[],
  gains: number[],
): number {
  return summerOutput(inputs, gains)
}

/** Potentiometer: out = k × in. */
export function potOutput(input: number, k: number): number {
  const coeff = Math.min(1, Math.max(0, k))
  return coeff * input
}

/** Inverter: out = −in. */
export function inverterOutput(input: number): number {
  return -input
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

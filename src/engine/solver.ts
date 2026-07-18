import {
  bipolarInput,
  integratorDerivative,
  inverterOutput,
  multiplierOutput,
  portsFor,
  potOutput,
  signalOutput,
  summerOutput,
} from './elements'
import { functionGeneratorOutput } from './functionGenerator'
import {
  OVERLOAD_THRESHOLD,
  type Cable,
  type CircuitNode,
  type MachineMode,
  portKey,
  type PortRef,
  type TimeFactor,
} from './types'

export interface EvalResult {
  voltages: Record<string, number>
  derivatives: Record<string, number>
  overloaded: Set<string>
  warning?: string
}

const SUM_PORTS = ['in0', 'in1', 'in2', 'in3', 'in4', 's'] as const
const INT_PORTS = ['in0', 'in1', 'in2', 'in3', 'in4', 's'] as const

function gainFor(node: CircuitNode, port: string): number {
  return node.inputGains?.[port] ?? 1
}

function buildInputMap(cables: Cable[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of cables) {
    map.set(portKey(c.to), portKey(c.from))
  }
  return map
}

function nodeById(nodes: CircuitNode[]): Map<string, CircuitNode> {
  return new Map(nodes.map((n) => [n.id, n]))
}

function isAlgebraic(kind: CircuitNode['kind']): boolean {
  return (
    kind === 'potentiometer' ||
    kind === 'summer' ||
    kind === 'inverter' ||
    kind === 'functionGenerator' ||
    kind === 'multiplier'
  )
}

function seedFixedVoltages(
  nodes: CircuitNode[],
  states: Record<string, number>,
  time: number,
  voltages: Record<string, number>,
): void {
  for (const n of nodes) {
    const out = portKey({ nodeId: n.id, port: 'out' })
    if (n.kind === 'reference') {
      voltages[out] = n.voltage ?? 0
    } else if (n.kind === 'signal') {
      voltages[out] = signalOutput(
        time,
        n.waveform ?? 'road',
        n.amplitude ?? 1.5,
        n.frequency ?? 2.2,
      )
    } else if (n.kind === 'integrator') {
      voltages[out] = states[n.id] ?? n.state ?? 0
    }
  }
}

function algebraicDepsFor(
  node: CircuitNode,
  inputMap: Map<string, string>,
  byId: Map<string, CircuitNode>,
): Set<string> {
  const set = new Set<string>()
  for (const p of portsFor(node.kind, node)) {
    if (p.direction !== 'in') continue
    const src = inputMap.get(portKey({ nodeId: node.id, port: p.name }))
    if (!src) continue
    const srcNode = byId.get(src.split(':')[0])
    if (srcNode && isAlgebraic(srcNode.kind)) set.add(srcNode.id)
  }
  return set
}

function topologicalOrder(
  algebraic: CircuitNode[],
  inputMap: Map<string, string>,
  byId: Map<string, CircuitNode>,
): { order: string[]; warning?: string } {
  const deps = new Map<string, Set<string>>()
  for (const n of algebraic) {
    deps.set(n.id, algebraicDepsFor(n, inputMap, byId))
  }

  const inDegree = new Map<string, number>()
  for (const [id, set] of deps) inDegree.set(id, set.size)

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const order: string[] = []
  const remaining = new Set(algebraic.map((n) => n.id))
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    remaining.delete(id)
    for (const [other, set] of deps) {
      if (!set.has(id)) continue
      set.delete(id)
      const deg = (inDegree.get(other) ?? 1) - 1
      inDegree.set(other, deg)
      if (deg === 0) queue.push(other)
    }
  }

  if (remaining.size === 0) return { order }
  order.push(...remaining)
  return {
    order,
    warning: 'Ungrounded algebraic feedback loop — patch may be invalid.',
  }
}

type ReadInput = (ref: PortRef) => number

function evalAlgebraicNode(
  n: CircuitNode,
  voltages: Record<string, number>,
  readInput: ReadInput,
): void {
  const out = portKey({ nodeId: n.id, port: 'out' })
  switch (n.kind) {
    case 'potentiometer': {
      const vin = readInput({ nodeId: n.id, port: 'in' })
      voltages[out] = potOutput(vin, n.coefficient ?? 0)
      return
    }
    case 'inverter': {
      const vin = readInput({ nodeId: n.id, port: 'in' })
      voltages[out] = inverterOutput(vin)
      return
    }
    case 'summer': {
      const inputs = SUM_PORTS.map((p) => readInput({ nodeId: n.id, port: p }))
      const gains = SUM_PORTS.map((p) => gainFor(n, p))
      voltages[out] = summerOutput(inputs, gains)
      return
    }
    case 'functionGenerator': {
      const vin = readInput({ nodeId: n.id, port: 'in' })
      voltages[out] = functionGeneratorOutput(vin, n.breakpoints ?? [])
      return
    }
    case 'multiplier': {
      const xp = readInput({ nodeId: n.id, port: 'xp' })
      const xm = readInput({ nodeId: n.id, port: 'xm' })
      const yp = readInput({ nodeId: n.id, port: 'yp' })
      const ym = readInput({ nodeId: n.id, port: 'ym' })
      const product = multiplierOutput(bipolarInput(xp, xm), bipolarInput(yp, ym))
      voltages[out] = product
      voltages[portKey({ nodeId: n.id, port: 'g' })] = product
      return
    }
    default:
      return
  }
}

function applyIntegratorIc(
  nodes: CircuitNode[],
  inputMap: Map<string, string>,
  voltages: Record<string, number>,
): void {
  for (const n of nodes) {
    if (n.kind !== 'integrator') continue
    const icSrc = inputMap.get(portKey({ nodeId: n.id, port: 'ic' }))
    let out = n.initialCondition ?? 0
    if (icSrc !== undefined) out = voltages[icSrc] ?? out
    voltages[portKey({ nodeId: n.id, port: 'out' })] = out
  }
}

function computeIntegratorDerivatives(
  nodes: CircuitNode[],
  readInput: ReadInput,
): Record<string, number> {
  const derivatives: Record<string, number> = {}
  for (const n of nodes) {
    if (n.kind !== 'integrator') continue
    const inputs = INT_PORTS.map((p) => readInput({ nodeId: n.id, port: p }))
    const gains = INT_PORTS.map((p) => gainFor(n, p))
    const tf = (n.timeFactor ?? 1) as TimeFactor
    derivatives[n.id] = integratorDerivative(inputs, gains, tf)
  }
  return derivatives
}

function collectOverloads(voltages: Record<string, number>): Set<string> {
  const overloaded = new Set<string>()
  for (const [key, v] of Object.entries(voltages)) {
    if (Math.abs(v) > OVERLOAD_THRESHOLD) overloaded.add(key.split(':')[0])
  }
  return overloaded
}

export function evaluateAlgebraic(
  nodes: CircuitNode[],
  cables: Cable[],
  states: Record<string, number>,
  mode: MachineMode,
  time = 0,
): EvalResult {
  const byId = nodeById(nodes)
  const inputMap = buildInputMap(cables)
  const voltages: Record<string, number> = {}
  seedFixedVoltages(nodes, states, time, voltages)

  const algebraic = nodes.filter((n) => isAlgebraic(n.kind))
  const { order, warning } = topologicalOrder(algebraic, inputMap, byId)

  const readInput: ReadInput = (ref) => {
    const src = inputMap.get(portKey(ref))
    if (!src) return 0
    return voltages[src] ?? 0
  }

  for (const id of order) {
    evalAlgebraicNode(byId.get(id)!, voltages, readInput)
  }

  if (mode === 'ic' || mode === 'potSet') {
    applyIntegratorIc(nodes, inputMap, voltages)
  }

  return {
    voltages,
    derivatives: computeIntegratorDerivatives(nodes, readInput),
    overloaded: collectOverloads(voltages),
    warning,
  }
}

export function rk4Step(
  nodes: CircuitNode[],
  cables: Cable[],
  states: Record<string, number>,
  dt: number,
  mode: MachineMode,
  time = 0,
): { states: Record<string, number>; eval: EvalResult } {
  const integrators = nodes.filter((n) => n.kind === 'integrator')

  if (mode !== 'operate' || dt === 0 || integrators.length === 0) {
    const ev = evaluateAlgebraic(nodes, cables, states, mode, time)
    const next = { ...states }
    if (mode === 'ic' || mode === 'potSet') {
      for (const n of integrators) {
        const v =
          ev.voltages[portKey({ nodeId: n.id, port: 'out' })] ??
          n.initialCondition ??
          0
        next[n.id] = v
      }
    }
    return { states: next, eval: ev }
  }

  const derivAt = (s: Record<string, number>, t: number) =>
    evaluateAlgebraic(nodes, cables, s, 'operate', t)

  const k1 = derivAt(states, time)
  const s2: Record<string, number> = { ...states }
  for (const n of integrators) {
    s2[n.id] = (states[n.id] ?? 0) + (k1.derivatives[n.id] ?? 0) * (dt / 2)
  }
  const k2 = derivAt(s2, time + dt / 2)
  const s3: Record<string, number> = { ...states }
  for (const n of integrators) {
    s3[n.id] = (states[n.id] ?? 0) + (k2.derivatives[n.id] ?? 0) * (dt / 2)
  }
  const k3 = derivAt(s3, time + dt / 2)
  const s4: Record<string, number> = { ...states }
  for (const n of integrators) {
    s4[n.id] = (states[n.id] ?? 0) + (k3.derivatives[n.id] ?? 0) * dt
  }
  const k4 = derivAt(s4, time + dt)

  const next: Record<string, number> = { ...states }
  for (const n of integrators) {
    const d1 = k1.derivatives[n.id] ?? 0
    const d2 = k2.derivatives[n.id] ?? 0
    const d3 = k3.derivatives[n.id] ?? 0
    const d4 = k4.derivatives[n.id] ?? 0
    next[n.id] =
      (states[n.id] ?? 0) + (dt / 6) * (d1 + 2 * d2 + 2 * d3 + d4)
  }

  const finalEval = evaluateAlgebraic(nodes, cables, next, 'operate', time + dt)
  return { states: next, eval: finalEval }
}

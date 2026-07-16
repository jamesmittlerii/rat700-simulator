import { countAmplifiers, countPots, createNode } from './elements'
import { evaluateAlgebraic, rk4Step, type EvalResult } from './solver'
import { scopeChannelsFor } from '../scope/channels'
import {
  MAX_AMPLIFIERS,
  MAX_POTENTIOMETERS,
  type Cable,
  type CircuitNode,
  type CircuitSnapshot,
  type ElementKind,
  type MachineMode,
  portKey,
} from './types'

export interface MachineState {
  nodes: CircuitNode[]
  cables: Cable[]
  mode: MachineMode
  powered: boolean
  timeScale: number
  time: number
  states: Record<string, number>
  lastEval: EvalResult
  idCounter: number
  /** X/Y scope samples captured during the last stepMachine call (substep oversampling). */
  phosphorBatch?: PhosphorSample[]
}

export interface PhosphorSample {
  t: number
  channels: Record<string, { x: number; y: number }>
}

export function createEmptyMachine(): MachineState {
  const nodes: CircuitNode[] = [
    createNode('reference', 'ref_p10', '+10 V', 40, 40, { voltage: 10 }),
    createNode('reference', 'ref_m10', '−10 V', 40, 120, { voltage: -10 }),
    createNode('reference', 'ref_gnd', 'Ground', 40, 200, { voltage: 0 }),
  ]
  const states: Record<string, number> = {}
  const lastEval = evaluateAlgebraic(nodes, [], states, 'ic', 0)
  return {
    nodes,
    cables: [],
    mode: 'ic',
    powered: true,
    timeScale: 1,
    time: 0,
    states,
    lastEval,
    idCounter: 1,
  }
}

export function syncNodeStates(machine: MachineState): CircuitNode[] {
  return machine.nodes.map((n) =>
    n.kind === 'integrator'
      ? { ...n, state: machine.states[n.id] ?? n.state ?? 0 }
      : n,
  )
}

export function setMode(machine: MachineState, mode: MachineMode): MachineState {
  let next = { ...machine, mode }
  // Entering IC: force states from IC evaluation
  const step = rk4Step(next.nodes, next.cables, next.states, 0, mode, next.time)
  next = {
    ...next,
    states: step.states,
    lastEval: step.eval,
    nodes: syncNodesWithStates(next.nodes, step.states),
  }
  return next
}

function syncNodesWithStates(
  nodes: CircuitNode[],
  states: Record<string, number>,
): CircuitNode[] {
  return nodes.map((n) =>
    n.kind === 'integrator'
      ? { ...n, state: states[n.id] ?? n.state ?? 0 }
      : n,
  )
}

export function stepMachine(
  machine: MachineState,
  wallDt: number,
  opts?: { captureScope?: boolean },
): MachineState {
  if (!machine.powered) return machine
  if (machine.mode !== 'operate') {
    const ev = evaluateAlgebraic(
      machine.nodes,
      machine.cables,
      machine.states,
      machine.mode,
      machine.time,
    )
    const states =
      machine.mode === 'ic' || machine.mode === 'potSet'
        ? Object.fromEntries(
            machine.nodes
              .filter((n) => n.kind === 'integrator')
              .map((n) => [
                n.id,
                ev.voltages[portKey({ nodeId: n.id, port: 'out' })] ??
                  n.initialCondition ??
                  0,
              ]),
          )
        : machine.states
    return {
      ...machine,
      states,
      lastEval: ev,
      phosphorBatch: [],
      nodes: syncNodesWithStates(machine.nodes, states),
    }
  }

  const channels = scopeChannelsFor(machine.nodes)
  const captureScope = opts?.captureScope === true && channels.length > 0
  /** Finer steps for multi-channel vehicle figure; oscillator orbit is slower. */
  const fineScope = channels.some((c) => c.id === 'wheelL')
  const machineDt = wallDt * machine.timeScale
  const maxSub = captureScope && fineScope ? 0.0005 : captureScope ? 0.002 : 0.005
  let remaining = machineDt
  let states = { ...machine.states }
  let lastEval = machine.lastEval
  let time = machine.time
  const phosphorBatch: PhosphorSample[] = []

  while (remaining > 1e-12) {
    const dt = Math.min(maxSub, remaining)
    const result = rk4Step(
      machine.nodes,
      machine.cables,
      states,
      dt,
      'operate',
      time,
    )
    states = result.states
    lastEval = result.eval
    time += dt
    remaining -= dt

    if (captureScope) {
      const chMap: PhosphorSample['channels'] = {}
      for (const ch of channels) {
        chMap[ch.id] = {
          x: lastEval.voltages[portKey({ nodeId: ch.xNode, port: 'out' })] ?? 0,
          y: lastEval.voltages[portKey({ nodeId: ch.yNode, port: 'out' })] ?? 0,
        }
      }
      phosphorBatch.push({ t: time, channels: chMap })
    }
  }

  return {
    ...machine,
    states,
    lastEval,
    time,
    phosphorBatch,
    nodes: syncNodesWithStates(machine.nodes, states),
  }
}

export function addElement(
  machine: MachineState,
  kind: ElementKind,
  x = 200,
  y = 120,
): { machine: MachineState; error?: string } {
  if (
    (kind === 'summer' ||
      kind === 'integrator' ||
      kind === 'inverter' ||
      kind === 'functionGenerator') &&
    countAmplifiers(machine.nodes) >= MAX_AMPLIFIERS
  ) {
    return { machine, error: `Maximum ${MAX_AMPLIFIERS} amplifiers.` }
  }
  if (kind === 'potentiometer' && countPots(machine.nodes) >= MAX_POTENTIOMETERS) {
    return { machine, error: `Maximum ${MAX_POTENTIOMETERS} potentiometers.` }
  }
  if (kind === 'reference') {
    return { machine, error: 'Use the built-in reference jacks.' }
  }
  if (kind === 'signal' && machine.nodes.some((n) => n.kind === 'signal')) {
    return { machine, error: 'Only one road/signal generator is supported.' }
  }

  const id = `${kind}_${machine.idCounter}`
  const labels: Record<string, string> = {
    potentiometer: `Pot ${countPots(machine.nodes) + 1}`,
    summer: `Summer ${countAmplifiers(machine.nodes) + 1}`,
    integrator: `Int ${machine.nodes.filter((n) => n.kind === 'integrator').length + 1}`,
    inverter: `Inv ${machine.nodes.filter((n) => n.kind === 'inverter').length + 1}`,
    signal: 'Road',
    functionGenerator: 'Func gen',
  }
  const node = createNode(kind, id, labels[kind] ?? kind, x, y)
  const states = { ...machine.states }
  if (kind === 'integrator') states[id] = node.initialCondition ?? 0

  const nodes = [...machine.nodes, node]
  const lastEval = evaluateAlgebraic(nodes, machine.cables, states, machine.mode, machine.time)
  return {
    machine: {
      ...machine,
      nodes,
      states,
      lastEval,
      idCounter: machine.idCounter + 1,
    },
  }
}

export function removeNode(
  machine: MachineState,
  nodeId: string,
): MachineState {
  const node = machine.nodes.find((n) => n.id === nodeId)
  if (!node || node.kind === 'reference') return machine
  const nodes = machine.nodes.filter((n) => n.id !== nodeId)
  const cables = machine.cables.filter(
    (c) => c.from.nodeId !== nodeId && c.to.nodeId !== nodeId,
  )
  const states = { ...machine.states }
  delete states[nodeId]
  const lastEval = evaluateAlgebraic(nodes, cables, states, machine.mode, machine.time)
  return { ...machine, nodes, cables, states, lastEval }
}

export function setCoefficient(
  machine: MachineState,
  nodeId: string,
  k: number,
): MachineState {
  const nodes = machine.nodes.map((n) =>
    n.id === nodeId ? { ...n, coefficient: Math.min(1, Math.max(0, k)) } : n,
  )
  const lastEval = evaluateAlgebraic(
    nodes,
    machine.cables,
    machine.states,
    machine.mode,
    machine.time,
  )
  return { ...machine, nodes, lastEval }
}

export function setSignalParams(
  machine: MachineState,
  nodeId: string,
  params: { amplitude?: number; frequency?: number },
): MachineState {
  const nodes = machine.nodes.map((n) =>
    n.id === nodeId && n.kind === 'signal'
      ? {
          ...n,
          amplitude: params.amplitude ?? n.amplitude,
          frequency: params.frequency ?? n.frequency,
        }
      : n,
  )
  const lastEval = evaluateAlgebraic(
    nodes,
    machine.cables,
    machine.states,
    machine.mode,
    machine.time,
  )
  return { ...machine, nodes, lastEval }
}

export function setInitialCondition(
  machine: MachineState,
  nodeId: string,
  value: number,
): MachineState {
  const nodes = machine.nodes.map((n) =>
    n.id === nodeId ? { ...n, initialCondition: value } : n,
  )
  const result = rk4Step(nodes, machine.cables, machine.states, 0, machine.mode, machine.time)
  return {
    ...machine,
    nodes: syncNodesWithStates(nodes, result.states),
    states: result.states,
    lastEval: result.eval,
  }
}

export function setInputGain(
  machine: MachineState,
  nodeId: string,
  port: string,
  gain: 1 | 10,
): MachineState {
  const nodes = machine.nodes.map((n) => {
    if (n.id !== nodeId) return n
    return {
      ...n,
      inputGains: { ...n.inputGains, [port]: gain },
    }
  })
  const lastEval = evaluateAlgebraic(
    nodes,
    machine.cables,
    machine.states,
    machine.mode,
    machine.time,
  )
  return { ...machine, nodes, lastEval }
}

export function addCable(
  machine: MachineState,
  from: Cable['from'],
  to: Cable['to'],
): { machine: MachineState; error?: string } {
  // Only out → in
  const fromNode = machine.nodes.find((n) => n.id === from.nodeId)
  const toNode = machine.nodes.find((n) => n.id === to.nodeId)
  if (!fromNode || !toNode) return { machine, error: 'Invalid jack.' }

  // Replace existing cable on same input
  const cables = machine.cables.filter(
    (c) => !(c.to.nodeId === to.nodeId && c.to.port === to.port),
  )
  const id = `cable_${machine.idCounter}`
  cables.push({ id, from, to })
  const lastEval = evaluateAlgebraic(
    machine.nodes,
    cables,
    machine.states,
    machine.mode,
    machine.time,
  )
  return {
    machine: {
      ...machine,
      cables,
      lastEval,
      idCounter: machine.idCounter + 1,
    },
  }
}

export function removeCable(machine: MachineState, cableId: string): MachineState {
  const cables = machine.cables.filter((c) => c.id !== cableId)
  const lastEval = evaluateAlgebraic(
    machine.nodes,
    cables,
    machine.states,
    machine.mode,
    machine.time,
  )
  return { ...machine, cables, lastEval }
}

export function moveNode(
  machine: MachineState,
  nodeId: string,
  x: number,
  y: number,
): MachineState {
  const nodes = machine.nodes.map((n) =>
    n.id === nodeId ? { ...n, x, y } : n,
  )
  return { ...machine, nodes }
}

export function resetTime(machine: MachineState): MachineState {
  // Re-apply IC
  const result = rk4Step(machine.nodes, machine.cables, machine.states, 0, 'ic', 0)
  return {
    ...machine,
    mode: 'ic',
    time: 0,
    states: result.states,
    lastEval: result.eval,
    nodes: syncNodesWithStates(machine.nodes, result.states),
  }
}

export function toSnapshot(machine: MachineState): CircuitSnapshot {
  return {
    nodes: syncNodeStates(machine),
    cables: machine.cables,
    mode: machine.mode,
    powered: machine.powered,
    timeScale: machine.timeScale,
    time: machine.time,
  }
}

export function fromSnapshot(snap: CircuitSnapshot): MachineState {
  const states: Record<string, number> = {}
  for (const n of snap.nodes) {
    if (n.kind === 'integrator') {
      states[n.id] = n.state ?? n.initialCondition ?? 0
    }
  }
  let maxId = 0
  for (const n of snap.nodes) {
    const m = /_(\d+)$/.exec(n.id)
    if (m) maxId = Math.max(maxId, Number(m[1]))
  }
  for (const c of snap.cables) {
    const m = /_(\d+)$/.exec(c.id)
    if (m) maxId = Math.max(maxId, Number(m[1]))
  }
  const lastEval = evaluateAlgebraic(
    snap.nodes,
    snap.cables,
    states,
    snap.mode,
    snap.time,
  )
  return {
    nodes: snap.nodes,
    cables: snap.cables,
    mode: snap.mode,
    powered: snap.powered,
    timeScale: snap.timeScale,
    time: snap.time,
    states,
    lastEval,
    idCounter: maxId + 1,
  }
}

export function loadMachine(machine: MachineState): MachineState {
  return machine
}

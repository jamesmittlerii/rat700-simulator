import {
  countAmplifiers,
  countMultipliers,
  countPots,
  createNode,
  potOutput,
} from './elements'
import { ampConfigFromJumpers, defaultJumpers, upsertJumper } from './jumpers'
import { setEquidistantY } from './functionGenerator'
import { evaluateAlgebraic, rk4Step, type EvalResult } from './solver'
import { scopeChannelsFor } from '../scope/channels'
import {
  DEFAULT_STEPS_PER_FRAME,
  MACHINE_UNIT,
  MAX_AMPLIFIERS,
  MAX_MULTIPLIERS,
  MAX_POTENTIOMETERS,
  OVERLOAD_THRESHOLD,
  panelButtonToMode,
  type Cable,
  type CircuitNode,
  type CircuitSnapshot,
  type ElementKind,
  type JumperPlacement,
  type MachineMode,
  type PanelButton,
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
  jumpers: JumperPlacement[]
  panelButton: PanelButton
  /** Master 10-turn reference dial for Pot. Einst. (0…1 → 0…+10 V). */
  masterRef: number
  /** Potentiometer channel selected for null-balance calibration. */
  calibratePotId: string | null
  /** AS jacks shorted → overload forces Hold. */
  autoShutdown: boolean
  /** Explicit RK4 oversampling count per animation frame (operate). */
  stepsPerFrame: number
  /** Fremd (external slave) — local mode changes locked. */
  externalSlave: boolean
  /** One-shot run duration remaining (machine seconds); null = continuous. */
  einmalRemaining: number | null
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
    createNode('functionGenerator', 'fg_1', 'F1', 100, 40),
    createNode('functionGenerator', 'fg_2', 'F2', 100, 120),
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
    jumpers: defaultJumpers(),
    panelButton: 'pause',
    masterRef: 0.5,
    calibratePotId: null,
    autoShutdown: false,
    stepsPerFrame: DEFAULT_STEPS_PER_FRAME,
    externalSlave: false,
    einmalRemaining: null,
  }
}

export function syncNodeStates(machine: MachineState): CircuitNode[] {
  return machine.nodes.map((n) =>
    n.kind === 'integrator'
      ? { ...n, state: machine.states[n.id] ?? n.state ?? 0 }
      : n,
  )
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

/** Null-balance meter deflection: pot wiper − master reference (volts). */
export function potCalMeter(machine: MachineState): number {
  const potId = machine.calibratePotId
  if (!potId) return 0
  const pot = machine.nodes.find((n) => n.id === potId)
  if (!pot || pot.kind !== 'potentiometer') return 0
  const vin =
    machine.lastEval.voltages[portKey({ nodeId: potId, port: 'in' })] ??
    MACHINE_UNIT
  const wiper = potOutput(vin, pot.coefficient ?? 0)
  const ref = machine.masterRef * MACHINE_UNIT
  return wiper - ref
}

export function setPanelButton(
  machine: MachineState,
  button: PanelButton,
): MachineState {
  if (machine.externalSlave && button !== 'fremd') {
    return machine
  }
  const mode = panelButtonToMode(button)
  let next: MachineState = {
    ...machine,
    panelButton: button,
    externalSlave: button === 'fremd',
    einmalRemaining: button === 'einmal' ? 2 : null,
  }
  if (button === 'fremd') {
    next = { ...next, mode: 'hold' }
  } else {
    next = setMode(next, mode)
  }
  return next
}

export function setMode(machine: MachineState, mode: MachineMode): MachineState {
  let next = { ...machine, mode }
  const step = rk4Step(next.nodes, next.cables, next.states, 0, mode, next.time)
  next = {
    ...next,
    states: step.states,
    lastEval: step.eval,
    nodes: syncNodesWithStates(next.nodes, step.states),
  }
  return next
}

export function stepMachine(
  machine: MachineState,
  wallDt: number,
  opts?: { captureScope?: boolean; stepsPerFrame?: number },
): MachineState {
  if (!machine.powered) return machine
  if (machine.externalSlave && machine.panelButton === 'fremd') {
    return {
      ...machine,
      phosphorBatch: [],
    }
  }
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
  const fineScope = channels.some((c) => c.id === 'wheelL')
  const machineDt = wallDt * machine.timeScale
  const steps =
    opts?.stepsPerFrame ?? machine.stepsPerFrame ?? DEFAULT_STEPS_PER_FRAME
  const maxSub =
    captureScope && fineScope
      ? 0.0005
      : captureScope
        ? 0.002
        : Math.max(1e-4, machineDt / Math.max(1, steps))

  let remaining = machineDt
  if (machine.einmalRemaining != null) {
    remaining = Math.min(remaining, machine.einmalRemaining)
  }

  let states = { ...machine.states }
  let lastEval = machine.lastEval
  let time = machine.time
  const phosphorBatch: PhosphorSample[] = []
  let einmalRemaining = machine.einmalRemaining

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
    if (einmalRemaining != null) {
      einmalRemaining -= dt
    }

    if (captureScope) {
      const chMap: PhosphorSample['channels'] = {}
      for (const ch of channels) {
        const x =
          (lastEval.voltages[portKey({ nodeId: ch.xNode, port: 'out' })] ?? 0) *
            (ch.xScale ?? 1) +
          (ch.xOffset ?? 0)
        let y =
          lastEval.voltages[portKey({ nodeId: ch.yNode, port: 'out' })] ?? 0
        y = y * (ch.yScale ?? 1) + (ch.yOffset ?? 0)
        const addScale = ch.yAddScale ?? 1
        for (const addId of ch.yAddNodes ?? []) {
          y +=
            (lastEval.voltages[portKey({ nodeId: addId, port: 'out' })] ?? 0) *
            addScale
        }
        chMap[ch.id] = {
          x,
          y,
        }
      }
      phosphorBatch.push({ t: time, channels: chMap })
    }

    if (
      machine.autoShutdown &&
      lastEval.overloaded.size > 0 &&
      [...lastEval.overloaded].some((id) => {
        const n = machine.nodes.find((x) => x.id === id)
        return n && (n.kind === 'integrator' || n.kind === 'summer' || n.kind === 'inverter')
      })
    ) {
      return {
        ...machine,
        mode: 'hold',
        panelButton: 'halt',
        states,
        lastEval,
        time,
        phosphorBatch,
        einmalRemaining: null,
        nodes: syncNodesWithStates(machine.nodes, states),
      }
    }
  }

  if (einmalRemaining != null && einmalRemaining <= 0) {
    const ic = setMode(
      {
        ...machine,
        states,
        lastEval,
        time,
        nodes: syncNodesWithStates(machine.nodes, states),
      },
      'ic',
    )
    return {
      ...ic,
      panelButton: 'pause',
      einmalRemaining: null,
      phosphorBatch,
    }
  }

  return {
    ...machine,
    states,
    lastEval,
    time,
    phosphorBatch,
    einmalRemaining,
    nodes: syncNodesWithStates(machine.nodes, states),
  }
}

/**
 * Apply jumper-derived Σ/∫ mode and time factor onto a switchable amp node.
 * Converts summer ↔ integrator when the 4-pin block moves.
 */
export function applyJumperConfig(
  machine: MachineState,
  nodeId: string,
): MachineState {
  const node = machine.nodes.find((n) => n.id === nodeId)
  if (!node || node.ampSlot == null) return machine
  const cfg = ampConfigFromJumpers(node.ampSlot, machine.jumpers)
  const nodes = machine.nodes.map((n) => {
    if (n.id !== nodeId) return n
    if (cfg.mode === 'integrator') {
      return {
        ...n,
        kind: 'integrator' as const,
        timeFactor: cfg.timeFactor,
        state: n.state ?? machine.states[n.id] ?? n.initialCondition ?? 0,
        initialCondition: n.initialCondition ?? 0,
        inputGains: n.inputGains ?? createNode('integrator', n.id, n.label, n.x, n.y).inputGains,
      }
    }
    return {
      ...n,
      kind: 'summer' as const,
      timeFactor: undefined,
      inputGains: n.inputGains ?? createNode('summer', n.id, n.label, n.x, n.y).inputGains,
    }
  })
  const states = { ...machine.states }
  const updated = nodes.find((n) => n.id === nodeId)!
  if (updated.kind === 'integrator') {
    states[nodeId] = updated.state ?? 0
  } else {
    delete states[nodeId]
  }
  const lastEval = evaluateAlgebraic(
    nodes,
    machine.cables,
    states,
    machine.mode,
    machine.time,
  )
  return { ...machine, nodes, states, lastEval }
}

export function setJumper(
  machine: MachineState,
  jumper: JumperPlacement,
): MachineState {
  const jumpers = upsertJumper(machine.jumpers, jumper)
  let next: MachineState = { ...machine, jumpers }
  for (const n of next.nodes) {
    if (n.ampSlot === jumper.ampSlot) {
      next = applyJumperConfig(next, n.id)
    }
  }
  return next
}

export function setTimeFactor(
  machine: MachineState,
  nodeId: string,
  timeFactor: 1 | 10 | 100,
): MachineState {
  const nodes = machine.nodes.map((n) =>
    n.id === nodeId && n.kind === 'integrator' ? { ...n, timeFactor } : n,
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
  if (kind === 'multiplier' && countMultipliers(machine.nodes) >= MAX_MULTIPLIERS) {
    return { machine, error: `Maximum ${MAX_MULTIPLIERS} multipliers.` }
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
    multiplier: `Mult ${countMultipliers(machine.nodes) + 1}`,
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

/**
 * Set one of the 21 FG adjusting knobs (ordinate at equidistant x ∈ [−10, +10]).
 * Canonicalizes the breakpoint table onto the museum grid.
 */
export function setFgBreakpoint(
  machine: MachineState,
  nodeId: string,
  index: number,
  y: number,
): MachineState {
  const nodes = machine.nodes.map((n) => {
    if (n.id !== nodeId || n.kind !== 'functionGenerator') return n
    return {
      ...n,
      breakpoints: setEquidistantY(n.breakpoints ?? [], index, y),
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

export function setMasterRef(machine: MachineState, value: number): MachineState {
  return {
    ...machine,
    masterRef: Math.min(1, Math.max(0, value)),
  }
}

export function setCalibratePot(
  machine: MachineState,
  potId: string | null,
): MachineState {
  return { ...machine, calibratePotId: potId }
}

export function setCableColor(
  machine: MachineState,
  cableId: string,
  color: string,
): MachineState {
  const cables = machine.cables.map((c) =>
    c.id === cableId ? { ...c, color } : c,
  )
  return { ...machine, cables }
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
  color?: string,
): { machine: MachineState; error?: string } {
  const fromNode = machine.nodes.find((n) => n.id === from.nodeId)
  const toNode = machine.nodes.find((n) => n.id === to.nodeId)
  if (!fromNode || !toNode) return { machine, error: 'Invalid jack.' }

  const cables = machine.cables.filter(
    (c) => !(c.to.nodeId === to.nodeId && c.to.port === to.port),
  )
  const id = `cable_${machine.idCounter}`
  cables.push({ id, from, to, color })
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
  const result = rk4Step(machine.nodes, machine.cables, machine.states, 0, 'ic', 0)
  return {
    ...machine,
    mode: 'ic',
    panelButton: 'pause',
    time: 0,
    states: result.states,
    lastEval: result.eval,
    einmalRemaining: null,
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
    jumpers: machine.jumpers,
    panelButton: machine.panelButton,
    masterRef: machine.masterRef,
    calibratePotId: machine.calibratePotId,
    autoShutdown: machine.autoShutdown,
    stepsPerFrame: machine.stepsPerFrame,
    externalSlave: machine.externalSlave,
  }
}

export function fromSnapshot(snap: CircuitSnapshot): MachineState {
  let nodes = [...snap.nodes]
  const fgCount = nodes.filter((n) => n.kind === 'functionGenerator').length
  if (fgCount === 0) {
    nodes.push(createNode('functionGenerator', 'fg_1', 'F1', 100, 40))
    nodes.push(createNode('functionGenerator', 'fg_2', 'F2', 100, 120))
  } else if (fgCount === 1) {
    nodes.push(createNode('functionGenerator', 'fg_2', 'F2', 100, 120))
  }

  const states: Record<string, number> = {}
  for (const n of nodes) {
    if (n.kind === 'integrator') {
      states[n.id] = n.state ?? n.initialCondition ?? 0
    }
  }
  let maxId = 0
  for (const n of nodes) {
    const m = /_(\d+)$/.exec(n.id)
    if (m) maxId = Math.max(maxId, Number(m[1]))
  }
  for (const c of snap.cables) {
    const m = /_(\d+)$/.exec(c.id)
    if (m) maxId = Math.max(maxId, Number(m[1]))
  }
  const lastEval = evaluateAlgebraic(
    nodes,
    snap.cables,
    states,
    snap.mode,
    snap.time,
  )
  return {
    nodes,
    cables: snap.cables,
    mode: snap.mode,
    powered: snap.powered,
    timeScale: snap.timeScale,
    time: snap.time,
    states,
    lastEval,
    idCounter: maxId + 1,
    jumpers: snap.jumpers ?? defaultJumpers(),
    panelButton: snap.panelButton ?? (snap.mode === 'operate' ? 'dauer' : snap.mode === 'hold' ? 'halt' : snap.mode === 'potSet' ? 'potSet' : 'pause'),
    masterRef: snap.masterRef ?? 0.5,
    calibratePotId: snap.calibratePotId ?? null,
    autoShutdown: snap.autoShutdown ?? false,
    stepsPerFrame: snap.stepsPerFrame ?? DEFAULT_STEPS_PER_FRAME,
    externalSlave: snap.externalSlave ?? false,
    einmalRemaining: null,
  }
}

export function loadMachine(machine: MachineState): MachineState {
  return machine
}

export { OVERLOAD_THRESHOLD }

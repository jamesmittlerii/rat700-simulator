import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import { defaultJumpers, upsertJumper } from '../engine/jumpers'
import type { CircuitSnapshot, JumperPlacement } from '../engine/types'

/**
 * Classic harmonic oscillator using two inverting integrators,
 * one inverter, and a frequency potentiometer (ω² ≈ k).
 *
 * Faceplate mapping: amps 01 & 02 (switchable slots 0,1) as integrators,
 * amp 03 as inverter.
 */
export function harmonicOscillatorSnapshot(): CircuitSnapshot {
  const int1 = createNode('integrator', 'int_1', 'Int 1 (x)', 280, 80, {
    initialCondition: 8,
    state: 8,
    timeFactor: 1,
    ampSlot: 0,
  })
  const int2 = createNode('integrator', 'int_2', 'Int 2 (y)', 280, 240, {
    initialCondition: 0,
    state: 0,
    timeFactor: 1,
    ampSlot: 1,
  })
  const inv1 = createNode('inverter', 'inv_1', 'Inv 1', 480, 80, {
    ampSlot: 2,
  })
  const pot1 = createNode('potentiometer', 'pot_1', 'Pot ω²', 480, 240, {
    coefficient: 1,
  })

  const nodes = [
    createNode('reference', 'ref_p10', '+10 V', 40, 40, { voltage: 10 }),
    createNode('reference', 'ref_m10', '−10 V', 40, 120, { voltage: -10 }),
    createNode('reference', 'ref_gnd', 'Ground', 40, 200, { voltage: 0 }),
    int1,
    int2,
    inv1,
    pot1,
  ]

  const cables = [
    {
      id: 'cable_1',
      from: { nodeId: 'int_2', port: 'out' },
      to: { nodeId: 'int_1', port: 'in0' },
    },
    {
      id: 'cable_2',
      from: { nodeId: 'int_1', port: 'out' },
      to: { nodeId: 'inv_1', port: 'in' },
    },
    {
      id: 'cable_3',
      from: { nodeId: 'inv_1', port: 'out' },
      to: { nodeId: 'pot_1', port: 'in' },
    },
    {
      id: 'cable_4',
      from: { nodeId: 'pot_1', port: 'out' },
      to: { nodeId: 'int_2', port: 'in0' },
    },
  ]

  let jumpers: JumperPlacement[] = defaultJumpers()
  for (const slot of [0, 1]) {
    jumpers = upsertJumper(jumpers, {
      id: `jmode_${slot}`,
      kind: 'mode4',
      ampSlot: slot,
      position: 'integral',
    })
    jumpers = upsertJumper(jumpers, {
      id: `jtime_${slot}`,
      kind: 'time2',
      ampSlot: slot,
      position: '1',
    })
  }

  return {
    nodes,
    cables,
    mode: 'ic',
    powered: true,
    timeScale: 1,
    time: 0,
    jumpers,
    panelButton: 'pause',
  }
}

export function loadHarmonicOscillator() {
  return fromSnapshot(harmonicOscillatorSnapshot())
}

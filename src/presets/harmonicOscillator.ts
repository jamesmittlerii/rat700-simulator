import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import type { CircuitSnapshot } from '../engine/types'

/**
 * Classic harmonic oscillator using two inverting integrators,
 * one inverter, and a frequency potentiometer (ω² ≈ k).
 *
 *   d(x)/dt = −y
 *   d(y)/dt = −(−k x) = k x   →  d²x/dt² = −k x
 */
export function harmonicOscillatorSnapshot(): CircuitSnapshot {
  const int1 = createNode('integrator', 'int_1', 'Int 1 (x)', 280, 80, {
    initialCondition: 8,
    state: 8,
  })
  const int2 = createNode('integrator', 'int_2', 'Int 2 (y)', 280, 240, {
    initialCondition: 0,
    state: 0,
  })
  const inv1 = createNode('inverter', 'inv_1', 'Inv 1', 480, 80)
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
    // int2.out → int1.in0  ⇒  dx/dt = −y
    {
      id: 'cable_1',
      from: { nodeId: 'int_2', port: 'out' },
      to: { nodeId: 'int_1', port: 'in0' },
    },
    // int1.out → inv1.in
    {
      id: 'cable_2',
      from: { nodeId: 'int_1', port: 'out' },
      to: { nodeId: 'inv_1', port: 'in' },
    },
    // inv1.out → pot1.in
    {
      id: 'cable_3',
      from: { nodeId: 'inv_1', port: 'out' },
      to: { nodeId: 'pot_1', port: 'in' },
    },
    // pot1.out → int2.in0  ⇒  dy/dt = −(−k x) = k x
    {
      id: 'cable_4',
      from: { nodeId: 'pot_1', port: 'out' },
      to: { nodeId: 'int_2', port: 'in0' },
    },
  ]

  return {
    nodes,
    cables,
    mode: 'ic',
    powered: true,
    timeScale: 1,
    time: 0,
  }
}

export function loadHarmonicOscillator() {
  return fromSnapshot(harmonicOscillatorSnapshot())
}

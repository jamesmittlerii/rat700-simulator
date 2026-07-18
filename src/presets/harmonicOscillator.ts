import { createNode } from '../engine/elements'
import { fromSnapshot } from '../engine/circuit'
import { defaultJumpers, upsertJumper } from '../engine/jumpers'
import type { JumperPlacement } from '../engine/types'
import {
  baseSnapshot,
  cable as c,
  integratorNode,
  referenceNodes,
} from './helpers'

/**
 * Classic harmonic oscillator using two inverting integrators,
 * one inverter, and a frequency potentiometer (ω² ≈ k).
 *
 * Faceplate mapping: amps 01 & 02 (switchable slots 0,1) as integrators,
 * amp 03 as inverter.
 */
export function harmonicOscillatorSnapshot() {
  const int1 = integratorNode('int_1', 'Int 1 (x)', 280, 80, 8, {
    timeFactor: 1,
    ampSlot: 0,
  })
  const int2 = integratorNode('int_2', 'Int 2 (y)', 280, 240, 0, {
    timeFactor: 1,
    ampSlot: 1,
  })
  const inv1 = createNode('inverter', 'inv_1', 'Inv 1', 480, 80, {
    ampSlot: 2,
  })
  const pot1 = createNode('potentiometer', 'pot_1', 'Pot ω²', 480, 240, {
    coefficient: 1,
  })

  const nodes = [...referenceNodes(), int1, int2, inv1, pot1]

  const cables = [
    c(1, 'int_2', 'out', 'int_1', 'in0'),
    c(2, 'int_1', 'out', 'inv_1', 'in'),
    c(3, 'inv_1', 'out', 'pot_1', 'in'),
    c(4, 'pot_1', 'out', 'int_2', 'in0'),
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

  return baseSnapshot(nodes, cables, { jumpers })
}

export function loadHarmonicOscillator() {
  return fromSnapshot(harmonicOscillatorSnapshot())
}

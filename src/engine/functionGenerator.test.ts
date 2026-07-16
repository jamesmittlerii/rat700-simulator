import { describe, expect, it } from 'vitest'
import {
  functionGeneratorOutput,
  CAR_BODY_BREAKPOINTS,
} from './functionGenerator'

describe('function generator', () => {
  it('interpolates car body silhouette', () => {
    const mid = functionGeneratorOutput(0, CAR_BODY_BREAKPOINTS)
    expect(mid).toBeGreaterThan(1.2)
    const nose = functionGeneratorOutput(-1, CAR_BODY_BREAKPOINTS)
    expect(nose).toBeLessThan(0.5)
  })
})

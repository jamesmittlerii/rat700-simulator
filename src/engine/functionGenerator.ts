import type { Breakpoint } from './types'
import { MACHINE_UNIT } from './types'

export type { Breakpoint }

/**
 * RAT 700 variable FG (§3.4): 20 straight-line segments with equidistant
 * abscissa breakpoints → 21 adjusting potentiometers spanning ±E.
 */
export const FG_SEGMENT_COUNT = 20
export const FG_KNOB_COUNT = FG_SEGMENT_COUNT + 1

/** Abscissa for knob index 0…20 over the machine unit (−10 … +10 V). */
export function equidistantX(index: number): number {
  const i = Math.max(0, Math.min(FG_KNOB_COUNT - 1, index))
  return (
    -MACHINE_UNIT +
    (i / (FG_KNOB_COUNT - 1)) * (2 * MACHINE_UNIT)
  )
}

/** Default FG: identity f(x) = x on the 21 equidistant knots. */
export function defaultFgBreakpoints(): Breakpoint[] {
  return Array.from({ length: FG_KNOB_COUNT }, (_, i) => {
    const x = equidistantX(i)
    return { x, y: x }
  })
}

/** Zero function (all knobs at mid-scale). */
export function zeroFgBreakpoints(): Breakpoint[] {
  return Array.from({ length: FG_KNOB_COUNT }, (_, i) => ({
    x: equidistantX(i),
    y: 0,
  }))
}

/**
 * Resample any breakpoint polyline onto the museum 21-knob equidistant grid.
 * Used so the faceplate knobs always map 1:1 to −10…+10.
 */
export function toEquidistantBreakpoints(
  breakpoints: Breakpoint[],
): Breakpoint[] {
  return Array.from({ length: FG_KNOB_COUNT }, (_, i) => {
    const x = equidistantX(i)
    return {
      x,
      y: functionGeneratorOutput(x, breakpoints.length ? breakpoints : zeroFgBreakpoints()),
    }
  })
}

/** Set one knobs's ordinate (clamped to ±E) and return a full 21-point table. */
export function setEquidistantY(
  breakpoints: Breakpoint[],
  index: number,
  y: number,
): Breakpoint[] {
  const pts = toEquidistantBreakpoints(breakpoints)
  const i = Math.max(0, Math.min(FG_KNOB_COUNT - 1, index))
  const clamped = Math.max(-MACHINE_UNIT, Math.min(MACHINE_UNIT, y))
  pts[i] = { x: equidistantX(i), y: clamped }
  return pts
}

/** Evaluate sorted breakpoints with linear interpolation and end hold. */
export function functionGeneratorOutput(
  input: number,
  breakpoints: Breakpoint[],
): number {
  if (breakpoints.length === 0) return 0
  const pts = [...breakpoints].sort((a, b) => a.x - b.x)
  if (input <= pts[0]!.x) return pts[0]!.y
  if (input >= pts[pts.length - 1]!.x) return pts[pts.length - 1]!.y
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (input >= a.x && input <= b.x) {
      const t = (input - a.x) / (b.x - a.x || 1)
      return a.y + t * (b.y - a.y)
    }
  }
  return pts[pts.length - 1]!.y
}

/**
 * Car upper silhouette as FG(cos).
 * Tuned for display-oscillator amplitude ≈ ±1 V (wheel radius).
 */
export const CAR_BODY_BREAKPOINTS: Breakpoint[] = [
  { x: -1.05, y: 0.12 },
  { x: -0.85, y: 0.22 },
  { x: -0.55, y: 0.45 },
  { x: -0.28, y: 1.15 },
  { x: -0.05, y: 1.45 },
  { x: 0.25, y: 1.45 },
  { x: 0.5, y: 1.05 },
  { x: 0.75, y: 0.4 },
  { x: 1.0, y: 0.15 },
]

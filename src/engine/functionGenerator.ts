import type { Breakpoint } from './types'

export type { Breakpoint }

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

import type { AmpConfig, JumperPlacement, TimeFactor } from './types'

/** Eight switchable Summator/Integrator blocks on the RAT 700 (amps 01,02,05,06,10,11,14,15). */
export const SWITCHABLE_AMP_SLOTS = [0, 1, 4, 5, 9, 10, 13, 14] as const

export function defaultJumpers(): JumperPlacement[] {
  const mode: JumperPlacement[] = SWITCHABLE_AMP_SLOTS.map((slot) => ({
    id: `jmode_${slot}`,
    kind: 'mode4' as const,
    ampSlot: slot,
    position: 'sigma' as const,
  }))
  const time: JumperPlacement[] = SWITCHABLE_AMP_SLOTS.map((slot) => ({
    id: `jtime_${slot}`,
    kind: 'time2' as const,
    ampSlot: slot,
    position: '1' as const,
  }))
  return [...mode, ...time]
}

export function ampConfigFromJumpers(
  ampSlot: number,
  jumpers: JumperPlacement[],
): AmpConfig {
  const modeJ = jumpers.find(
    (j) => j.ampSlot === ampSlot && j.kind === 'mode4',
  )
  const timeJ = jumpers.find(
    (j) => j.ampSlot === ampSlot && j.kind === 'time2',
  )
  const mode =
    modeJ?.position === 'integral' ? 'integrator' : 'summer'
  let timeFactor: TimeFactor = 1
  if (timeJ?.position === '10') timeFactor = 10
  return { mode, timeFactor }
}

export function isValidModePosition(
  position: JumperPlacement['position'],
): boolean {
  return position === 'sigma' || position === 'integral'
}

export function isValidTimePosition(
  position: JumperPlacement['position'],
): boolean {
  return position === '1' || position === '10'
}

/** Place or move a jumper; replaces any prior jumper of the same kind on that slot. */
export function upsertJumper(
  jumpers: JumperPlacement[],
  jumper: JumperPlacement,
): JumperPlacement[] {
  if (jumper.kind === 'mode4' && !isValidModePosition(jumper.position)) {
    return jumpers
  }
  if (jumper.kind === 'time2' && !isValidTimePosition(jumper.position)) {
    return jumpers
  }
  const filtered = jumpers.filter(
    (j) => !(j.ampSlot === jumper.ampSlot && j.kind === jumper.kind),
  )
  return [...filtered, jumper]
}

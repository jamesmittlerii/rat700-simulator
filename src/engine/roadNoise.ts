/**
 * Road / sine excitation.
 * `road` approximates a Wandel & Goltermann RG-1 + noise filter:
 * band-limited random noise, continuous in time (safe for RK4).
 */
export function signalOutput(
  time: number,
  waveform: 'road' | 'sine' = 'road',
  amplitude = 1.5,
  frequency = 2.2,
): number {
  const a = Math.max(0, amplitude)
  const w = Math.max(0.05, frequency)
  if (waveform === 'sine') {
    return a * Math.sin(w * time)
  }
  return a * filteredRoadNoise(time, w)
}

/** Deterministic hash → roughly uniform in [-1, 1]. */
function noiseSample(index: number): number {
  let n = Math.trunc(index)
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  n = n ^ (n >>> 16)
  // signed 32-bit → [-1, 1)
  return Math.trunc(n) / 2147483648
}

/**
 * Cubic Hermite interpolation of white samples at `bandwidth` Hz,
 * plus a slower octave — similar to filtered laboratory noise.
 */
function filteredRoadNoise(time: number, bandwidthRad: number): number {
  const bandwidthHz = bandwidthRad / (2 * Math.PI)
  const rate = Math.max(0.5, bandwidthHz * 4) // samples/s after filter-ish rate
  const primary = interpolatedNoise(time, rate, 0xA5)
  const slow = interpolatedNoise(time, rate * 0.35, 0x3C)
  // Blend; keep peak roughly ≤ 1
  return 0.72 * primary + 0.28 * slow
}

function interpolatedNoise(time: number, rate: number, seed: number): number {
  const x = time * rate
  const i = Math.floor(x)
  const f = x - i
  const n0 = noiseSample(i + seed * 997)
  const n1 = noiseSample(i + 1 + seed * 997)
  const n_1 = noiseSample(i - 1 + seed * 997)
  const n2 = noiseSample(i + 2 + seed * 997)
  // Catmull-Rom
  const f2 = f * f
  const f3 = f2 * f
  return 0.5 * (
    2 * n0 +
    (-n_1 + n1) * f +
    (2 * n_1 - 5 * n0 + 4 * n1 - n2) * f2 +
    (-n_1 + 3 * n0 - 3 * n1 + n2) * f3
  )
}

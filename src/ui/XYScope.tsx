import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { MachineState } from '../engine/circuit'
import { hasXYScope, scopeChannelsFor, type ScopeChannel } from '../scope/channels'

interface XYScopeProps {
  machine: MachineState
}

/**
 * Imperative handle so the animation loop can push simulation frames straight
 * to the canvas (`feed`) without forcing a React re-render of the whole app on
 * every frame.
 */
export interface XYScopeHandle {
  feed: (machine: MachineState) => void
}

type Pt = { x: number; y: number; t: number }

const PERSIST_VEHICLE = 0.28
const PERSIST_ORBIT = 2.5
/** Volts visible across half-width / half-height at baseline size. */
const VOLTS_HALF_VEHICLE = 3.75
const VOLTS_HALF_ORBIT = 11

function persistFor(channels: ScopeChannel[], isVehicle: boolean): number {
  return channels[0]?.persistSec ?? (isVehicle ? PERSIST_VEHICLE : PERSIST_ORBIT)
}

/** Shared phosphor X/Y oscilloscope for vehicle mux or single-trace orbits. */
export const XYScope = forwardRef<XYScopeHandle, XYScopeProps>(function XYScope(
  { machine },
  ref,
) {
  const buffers = useRef<Record<string, Pt[]>>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastMode = useRef(machine.mode)
  const lastTime = useRef(-1)
  /** Rolling 1 s window of feed() timestamps for the on-scope FPS readout. */
  const fpsRef = useRef({ stamps: [] as number[], value: 0, lastFeed: 0 })
  // Latest measured canvas size, read imperatively so drawing never depends on
  // a React render having flushed the state value.
  const sizeRef = useRef({ w: 320, h: 170 })
  const [canvasSize, setCanvasSize] = useState({ w: 320, h: 170 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      const w = Math.max(160, Math.floor(cr.width))
      const h = Math.max(100, Math.floor(cr.height))
      sizeRef.current = { w, h }
      setCanvasSize({ w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Reset detection + phosphor accumulation (only while operating). */
  const accumulate = useCallback((m: MachineState, channels: ScopeChannel[]) => {
    if (
      (lastMode.current !== 'operate' && m.mode === 'operate') ||
      m.time < lastTime.current
    ) {
      buffers.current = {}
    }
    lastMode.current = m.mode
    lastTime.current = m.time

    const batch = m.phosphorBatch
    if (!(m.powered && m.mode === 'operate' && batch && batch.length > 0)) return

    const isVehicle = channels.some((c) => c.id === 'wheelL')
    const persistSec = persistFor(channels, isVehicle)
    for (const sample of batch) {
      for (const ch of channels) {
        const pt = sample.channels[ch.id]
        if (!pt) continue
        const buf = buffers.current[ch.id] ?? []
        buf.push({ x: pt.x, y: pt.y, t: sample.t })
        buffers.current[ch.id] = buf
      }
    }
    const cutoff = m.time - persistSec
    // Keep enough points that long-persist orbits (Lorenz/Duffing) aren't
    // truncated before their persistence window elapses.
    const maxPoints = persistSec > 4 ? 4000 : 800
    for (const id of Object.keys(buffers.current)) {
      const buf = buffers.current[id]!
      while (buf.length > 0 && buf[0]!.t < cutoff) buf.shift()
      if (buf.length > maxPoints) buf.splice(0, buf.length - maxPoints)
    }
  }, [])

  /** Render the current buffers to the canvas (no accumulation). */
  const render = useCallback((m: MachineState, channels: ScopeChannel[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isVehicle = channels.some((c) => c.id === 'wheelL')
    const persistSec = persistFor(channels, isVehicle)
    const { w, h } = sizeRef.current

    const dpr = window.devicePixelRatio || 1
    if (
      canvas.width !== Math.floor(w * dpr) ||
      canvas.height !== Math.floor(h * dpr)
    ) {
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cx = w / 2
    const cy = h / 2
    const voltsHalf = isVehicle ? VOLTS_HALF_VEHICLE : VOLTS_HALF_ORBIT
    const px = Math.min(w, h) / 2 / voltsHalf

    ctx.fillStyle = '#030503'
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(20, 50, 34, 0.55)'
    ctx.lineWidth = 1
    const grid = Math.max(16, Math.round(Math.min(w, h) / 12))
    for (let x = 0; x < w; x += grid) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y < h; y += grid) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const now = m.time
    const lineW = Math.max(1.1, Math.min(w, h) / 140)
    for (const ch of channels) {
      const buf = buffers.current[ch.id]
      if (!buf || buf.length < 2) continue
      const stride = buf.length > 400 ? 2 : 1
      for (let i = stride; i < buf.length; i += stride) {
        const a = buf[i - stride]!
        const b = buf[i]!
        const age = now - b.t
        const alpha = Math.max(0.06, 1 - age / persistSec)
        ctx.strokeStyle = `rgba(57, 255, 122, ${alpha.toFixed(3)})`
        ctx.shadowColor = `rgba(57, 255, 122, ${(alpha * 0.35).toFixed(3)})`
        ctx.shadowBlur = 2.5
        ctx.lineWidth = lineW
        ctx.beginPath()
        ctx.moveTo(cx + a.x * px, cy - a.y * px)
        ctx.lineTo(cx + b.x * px, cy - b.y * px)
        ctx.stroke()
      }
    }

    ctx.shadowBlur = 0
    ctx.fillStyle = '#2a8f55'
    const fontPx = Math.max(10, Math.round(h / 28))
    ctx.font = `${fontPx}px IBM Plex Sans, monospace`
    ctx.fillText(
      isVehicle
        ? `X/Y mux · draw ~16 Hz · persist ${persistSec}s`
        : `${channels[0]?.label ?? 'X/Y orbit'} · persist ${persistSec}s`,
      8,
      Math.max(14, h * 0.08),
    )
    const wallNow = performance.now()
    const fpsFresh = wallNow - fpsRef.current.lastFeed < 500
    const fpsLabel = fpsFresh ? `${Math.round(fpsRef.current.value)} fps` : '— fps'
    const timeLabel = `t = ${m.time.toFixed(2)} s`
    ctx.fillText(timeLabel, 8, h - 8)
    const fpsWidth = ctx.measureText(fpsLabel).width
    ctx.fillText(fpsLabel, Math.max(8, w - 8 - fpsWidth), h - 8)
  }, [])

  // Per-frame feed from the animation loop: accumulate + draw at 60 fps without
  // re-rendering React.
  useImperativeHandle(
    ref,
    () => ({
      feed: (m: MachineState) => {
        const channels = scopeChannelsFor(m.nodes)
        if (channels.length === 0) return
        const now = performance.now()
        const fps = fpsRef.current
        fps.lastFeed = now
        fps.stamps.push(now)
        while (fps.stamps.length > 0 && now - fps.stamps[0]! > 1000) {
          fps.stamps.shift()
        }
        const oldest = fps.stamps[0]
        fps.value =
          fps.stamps.length > 1 && oldest != null
            ? ((fps.stamps.length - 1) * 1000) / (now - oldest)
            : 0
        accumulate(m, channels)
        render(m, channels)
      },
    }),
    [accumulate, render],
  )

  // Redraw on non-operate updates (preset load, reset, patch edits, resize).
  // Operate frames are driven by feed() above, so skip them here.
  useEffect(() => {
    if (machine.mode === 'operate') return
    const channels = scopeChannelsFor(machine.nodes)
    if (channels.length === 0) return
    accumulate(machine, channels)
    render(machine, channels)
  }, [machine, canvasSize, accumulate, render])

  const channels = scopeChannelsFor(machine.nodes)
  const isVehicle = channels.some((c) => c.id === 'wheelL')

  if (!hasXYScope(machine.nodes)) {
    return (
      <div className="vehicle-display">
        <div className="vehicle-label">Load a preset for the X/Y scope</div>
      </div>
    )
  }

  return (
    <div className="vehicle-display">
      <div className="vehicle-label">
        {isVehicle
          ? 'X/Y scope (mux) — cos/sin · FG body · RG-1 road'
          : (channels[0]?.title ?? 'X/Y scope — harmonic oscillator orbit')}
      </div>
      <div className="vehicle-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="vehicle-svg crt"
          style={{ width: canvasSize.w, height: canvasSize.h }}
          aria-label="Analog X/Y oscilloscope"
        />
      </div>
    </div>
  )
})

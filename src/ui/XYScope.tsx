import { useEffect, useRef, useState } from 'react'
import type { MachineState } from '../engine/circuit'
import { hasXYScope, scopeChannelsFor } from '../scope/channels'

interface XYScopeProps {
  machine: MachineState
}

type Pt = { x: number; y: number; t: number }

const PERSIST_VEHICLE = 0.28
const PERSIST_ORBIT = 2.5
/** Volts visible across half-width / half-height at baseline size. */
const VOLTS_HALF_VEHICLE = 3.75
const VOLTS_HALF_ORBIT = 11

/** Shared phosphor X/Y oscilloscope for vehicle mux or oscillator orbit. */
export function XYScope({ machine }: XYScopeProps) {
  const buffers = useRef<Record<string, Pt[]>>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastMode = useRef(machine.mode)
  const lastTime = useRef(-1)
  const [canvasSize, setCanvasSize] = useState({ w: 320, h: 170 })

  const channels = scopeChannelsFor(machine.nodes)
  const isVehicle = channels.some((c) => c.id === 'wheelL')
  const persistSec = isVehicle ? PERSIST_VEHICLE : PERSIST_ORBIT

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      const w = Math.max(160, Math.floor(cr.width))
      const h = Math.max(100, Math.floor(cr.height))
      setCanvasSize({ w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (channels.length === 0) return

    if (
      (lastMode.current !== 'operate' && machine.mode === 'operate') ||
      machine.time < lastTime.current
    ) {
      buffers.current = {}
    }
    lastMode.current = machine.mode
    lastTime.current = machine.time

    const batch = machine.phosphorBatch
    if (
      machine.powered &&
      machine.mode === 'operate' &&
      batch &&
      batch.length > 0
    ) {
      for (const sample of batch) {
        for (const ch of channels) {
          const pt = sample.channels[ch.id]
          if (!pt) continue
          const buf = buffers.current[ch.id] ?? []
          buf.push({ x: pt.x, y: pt.y, t: sample.t })
          buffers.current[ch.id] = buf
        }
      }
      const cutoff = machine.time - persistSec
      for (const id of Object.keys(buffers.current)) {
        const buf = buffers.current[id]!
        while (buf.length > 0 && buf[0]!.t < cutoff) buf.shift()
        if (buf.length > 800) buf.splice(0, buf.length - 800)
      }
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvasSize.w
    const h = canvasSize.h
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
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

    const now = machine.time
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
    ctx.font = `${Math.max(10, Math.round(h / 28))}px IBM Plex Sans, monospace`
    ctx.fillText(
      isVehicle
        ? `X/Y mux · draw ~16 Hz · persist ${persistSec}s`
        : `X/Y orbit · x=Int1  y=Int2 · persist ${persistSec}s`,
      8,
      Math.max(14, h * 0.08),
    )
    ctx.fillText(`t = ${machine.time.toFixed(2)} s`, 8, h - 8)
  })

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
          : 'X/Y scope — harmonic oscillator orbit'}
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
}

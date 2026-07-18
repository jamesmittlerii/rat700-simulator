import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { portsFor } from '../engine/elements'
import type { MachineState } from '../engine/circuit'
import type { PortRef } from '../engine/types'
import { portKey } from '../engine/types'

const JACK_COLORS: Record<string, string> = {
  green: '#2e6a3c',
  orange: '#d88838',
  red: '#c04038',
  blue: '#3a5fb3',
  black: '#2a2a2a',
  yellow: '#d4b028',
  white: '#e8e4d8',
  brown: '#6b4428',
}

const NODE_W = 140
const NODE_H_BASE = 56

interface SchematicCanvasProps {
  machine: MachineState
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMoveNode: (id: string, x: number, y: number) => void
  onConnect: (from: PortRef, to: PortRef) => void
  onRemoveCable: (cableId: string) => void
}

function jackPosition(
  nodeX: number,
  nodeY: number,
  kind: string,
  portName: string,
  direction: 'in' | 'out',
): { x: number; y: number } {
  const ports = portsFor(kind as never)
  const sidePorts = ports.filter((p) => p.direction === direction)
  const idx = sidePorts.findIndex((p) => p.name === portName)
  const count = Math.max(sidePorts.length, 1)
  const h = NODE_H_BASE + Math.max(0, count - 2) * 16
  const safeIdx = Math.max(0, idx)
  const y =
    count <= 1
      ? nodeY + h / 2
      : nodeY + 28 + safeIdx * ((h - 36) / (count - 1))
  const x = direction === 'in' ? nodeX : nodeX + NODE_W
  return { x, y }
}

/** Patch structure only — ignores live integrator state / lastEval churn. */
function schematicLayoutKey(machine: MachineState): string {
  const nodes = machine.nodes
    .map(
      (n) =>
        `${n.kind}:${n.id}:${n.label}:${n.x}:${n.y}:${n.coefficient ?? ''}:${n.voltage ?? ''}:${n.timeFactor ?? ''}`,
    )
    .join('|')
  const cables = machine.cables
    .map(
      (c) =>
        `${c.id}:${c.from.nodeId}.${c.from.port}>${c.to.nodeId}.${c.to.port}`,
    )
    .join(',')
  return `${nodes}#${cables}`
}

/**
 * Skip re-renders while operating when only machine time / voltages changed.
 * Callback identity is ignored — parents often pass inline arrows that close
 * over a stable setMachine.
 */
function schematicPropsAreEqual(
  prev: SchematicCanvasProps,
  next: SchematicCanvasProps,
): boolean {
  if (prev.selectedId !== next.selectedId) return false
  if (prev.machine.powered !== next.machine.powered) return false
  if (prev.machine.mode !== next.machine.mode) return false
  if (schematicLayoutKey(prev.machine) !== schematicLayoutKey(next.machine)) {
    return false
  }
  // Live run: structure unchanged → keep the SVG tree frozen so the ~15 Hz
  // React mirror cannot starve the scope's rAF loop (~14 fps symptom).
  if (next.machine.mode === 'operate' && next.machine.powered) return true
  return prev.machine.lastEval === next.machine.lastEval
}

function SchematicCanvasImpl({
  machine,
  selectedId,
  onSelect,
  onMoveNode,
  onConnect,
  onRemoveCable,
}: SchematicCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragNode, setDragNode] = useState<{
    id: string
    ox: number
    oy: number
  } | null>(null)
  const [patchFrom, setPatchFrom] = useState<PortRef | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: clientX, y: clientY }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  // machine.nodes gets a fresh array every sim step; key the jack map on
  // structure + positions only (same idea as FrontPanel's patch layoutKey).
  const layoutKey = schematicLayoutKey(machine)
  const jackMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const n of machine.nodes) {
      for (const p of portsFor(n.kind, n)) {
        map.set(
          portKey({ nodeId: n.id, port: p.name }),
          jackPosition(n.x, n.y, n.kind, p.name, p.direction),
        )
      }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutKey covers structural deps
  }, [layoutKey])

  const onPointerMove = (e: React.PointerEvent) => {
    const pos = toSvg(e.clientX, e.clientY)
    if (dragNode) {
      onMoveNode(dragNode.id, pos.x - dragNode.ox, pos.y - dragNode.oy)
    }
    if (patchFrom) setCursor(pos)
  }

  const onPointerUp = () => {
    setDragNode(null)
  }

  return (
    <svg
      ref={svgRef}
      className="schematic"
      viewBox="0 0 1100 820"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={() => {
        if (patchFrom) {
          setPatchFrom(null)
          setCursor(null)
        } else {
          onSelect(null)
        }
      }}
    >
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="rgba(0,0,0,0.06)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="960" height="560" fill="url(#grid)" />

      {/* Cables */}
      {machine.cables.map((c) => {
        const a = jackMap.get(portKey(c.from))
        const b = jackMap.get(portKey(c.to))
        if (!a || !b) return null
        const mx = (a.x + b.x) / 2
        const d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`
        return (
          <path
            key={c.id}
            d={d}
            className="cable"
            fill="none"
            stroke="#5c4a32"
            strokeWidth="2.5"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveCable(c.id)
            }}
          />
        )
      })}

      {/* Live patch preview */}
      {patchFrom && cursor && (() => {
        const a = jackMap.get(portKey(patchFrom))
        if (!a) return null
        const mx = (a.x + cursor.x) / 2
        return (
          <path
            d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${cursor.y}, ${cursor.x} ${cursor.y}`}
            fill="none"
            stroke="#5c4a32"
            strokeWidth="2"
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        )
      })()}

      {/* Nodes */}
      {machine.nodes.map((n) => {
        const ports = portsFor(n.kind, n)
        const inPorts = ports.filter((p) => p.direction === 'in')
        const h = NODE_H_BASE + Math.max(0, inPorts.length - 2) * 16
        const selected = selectedId === n.id
        const overloaded = machine.lastEval.overloaded.has(n.id)
        const outV =
          machine.lastEval.voltages[portKey({ nodeId: n.id, port: 'out' })]

        return (
          <g
            key={n.id}
            transform={`translate(${n.x}, ${n.y})`}
            className={`node ${selected ? 'selected' : ''} ${overloaded ? 'overloaded' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(n.id)
            }}
            onPointerDown={(e) => {
              if ((e.target as Element).closest('.jack')) return
              e.stopPropagation()
              const pos = toSvg(e.clientX, e.clientY)
              setDragNode({ id: n.id, ox: pos.x - n.x, oy: pos.y - n.y })
              onSelect(n.id)
              ;(e.target as Element).setPointerCapture?.(e.pointerId)
            }}
          >
            <rect
              width={NODE_W}
              height={h}
              rx="4"
              className="node-body"
            />
            <text x="10" y="18" className="node-title">
              {n.label}
            </text>
            {outV !== undefined && (
              <text x="10" y="34" className="node-voltage">
                {outV.toFixed(2)} V
              </text>
            )}
            {n.kind === 'potentiometer' && (
              <text x="10" y="48" className="node-meta">
                k={(n.coefficient ?? 0).toFixed(2)}
              </text>
            )}

            {ports.map((p) => {
              const local = jackPosition(0, 0, n.kind, p.name, p.direction)
              return (
                <g
                  key={p.name}
                  className="jack"
                  transform={`translate(${local.x}, ${local.y})`}
                  onClick={(e) => {
                    e.stopPropagation()
                    const ref: PortRef = { nodeId: n.id, port: p.name }
                    if (p.direction === 'out') {
                      setPatchFrom(ref)
                      setCursor(toSvg(e.clientX, e.clientY))
                      return
                    }
                    // input
                    if (patchFrom) {
                      onConnect(patchFrom, ref)
                      setPatchFrom(null)
                      setCursor(null)
                    }
                  }}
                >
                  <circle
                    r="7"
                    fill={JACK_COLORS[p.jack]}
                    stroke="#111"
                    strokeWidth="1"
                  />
                  <title>{`${p.label ?? p.name} (${p.direction})`}</title>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

export const SchematicCanvas = memo(SchematicCanvasImpl, schematicPropsAreEqual)

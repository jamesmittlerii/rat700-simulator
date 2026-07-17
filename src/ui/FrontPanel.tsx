import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { potCalMeter, type MachineState } from '../engine/circuit'
import {
  equidistantX,
  FG_KNOB_COUNT,
  toEquidistantBreakpoints,
} from '../engine/functionGenerator'
import type {
  JumperPlacement,
  PanelButton,
  PortRef,
} from '../engine/types'
import { MACHINE_UNIT, portKey } from '../engine/types'
import {
  AMP_STRIPS,
  FG_COLS,
  FREE_DIODE_BLOCKS,
  FREE_DIODE_VERTICAL_PAIRS,
  MULTIPLIER_BANKS,
  SWITCHABLE_BLOCKS,
  freeDiodeColPairs,
  freeDiodePairPointsRight,
  rowIndex,
} from './jackMap'
import {
  PATCH_COLS,
  PATCH_ROWS,
  POT_SLOTS,
  ROW_LETTERS,
  SWITCHABLE_LEFT_COLS,
  buildPatchLayout,
  findPortCell,
  isLegalModeJumper,
  isLegalTimeJumper,
  jumperRowSpan,
  type PatchCell,
} from './patchLayout'
import { buildSilkTies, buildSilkSectionLines } from './silkTies'
import { XYScope } from './XYScope'

const CABLE_COLORS = ['#c45c26', '#2a6f97', '#2d6a4f', '#7b2d8e', '#b08968']

const PANEL_BUTTONS: {
  id: PanelButton
  label: string
  tone: 'green' | 'yellow' | 'red'
}[] = [
  { id: 'dauer', label: 'Continuous', tone: 'green' },
  { id: 'einmal', label: 'Single Run', tone: 'green' },
  { id: 'fremd', label: 'External', tone: 'green' },
  { id: 'potSet', label: 'Pot Set', tone: 'yellow' },
  { id: 'pause', label: 'Pause', tone: 'yellow' },
  { id: 'halt', label: 'Hold', tone: 'red' },
]

interface FrontPanelProps {
  readonly machine: MachineState
  readonly selectedId: string | null
  readonly onSelect: (id: string | null) => void
  readonly onPanelButton: (button: PanelButton) => void
  readonly onPower: (on: boolean) => void
  readonly onCoefficient: (id: string, k: number) => void
  readonly onConnect: (from: PortRef, to: PortRef, color?: string) => void
  readonly onRemoveCable: (cableId: string) => void
  readonly onCableColor: (cableId: string, color: string) => void
  readonly onJumper: (jumper: JumperPlacement) => void
  readonly onMasterRef: (value: number) => void
  readonly onCalibratePot: (potId: string | null) => void
  readonly onAutoShutdown: (on: boolean) => void
  readonly onFgBreakpoint: (nodeId: string, index: number, y: number) => void
}

export function FrontPanel({
  machine,
  selectedId,
  onSelect,
  onPanelButton,
  onPower,
  onCoefficient,
  onConnect,
  onRemoveCable,
  onCableColor,
  onJumper,
  onMasterRef,
  onCalibratePot,
  onAutoShutdown,
  onFgBreakpoint,
}: FrontPanelProps) {
  const pots = useMemo(
    () =>
      machine.nodes
        .filter((n) => n.kind === 'potentiometer')
        .slice(0, POT_SLOTS),
    [machine.nodes],
  )

  const fgs = useMemo(
    () => machine.nodes.filter((n) => n.kind === 'functionGenerator').slice(0, 2),
    [machine.nodes],
  )

  const meterDeflection = potCalMeter(machine)
  const alert = machine.lastEval.warning
  const overloaded = machine.lastEval.overloaded.size > 0

  return (
    <div className={`front-panel v2 ${machine.powered ? 'powered' : ''}`}>
      <header className="fp-header">
        <div className="fp-brand-block">
          <span className="fp-brand">TELEFUNKEN</span>
          <span className="fp-model">RAT 700</span>
        </div>
        <div className="fp-alert-stack">
          {alert && <div className="fp-alert warn">{alert}</div>}
          {overloaded && (
            <div className="fp-alert overload">Übersteuerung — |U| ≥ 10.5 V</div>
          )}
        </div>
        <button
          type="button"
          className={`fp-netz ${machine.powered ? 'on' : ''}`}
          onClick={() => onPower(!machine.powered)}
        >
          Netz
        </button>
      </header>

      {/* Function generators F1 / F2 — 21 knobs each (−10 … +10) */}
      <FunctionGeneratorField
        fgs={fgs}
        powered={machine.powered}
        selectedId={selectedId}
        onSelect={onSelect}
        onFgBreakpoint={onFgBreakpoint}
      />

      {/* A. Potentiometer field */}
      <section className="fp-pots" aria-label="Coefficient potentiometers">
        {Array.from({ length: POT_SLOTS }, (_, i) => {
          const pot = pots[i]
          const k = pot?.coefficient ?? 0
          const selected = pot?.id === selectedId
          const calibrating = pot?.id === machine.calibratePotId
          return (
            <div
              key={i}
              className={`fp-pot ${pot ? '' : 'empty'} ${selected ? 'selected' : ''} ${calibrating ? 'calibrating' : ''}`}
            >
              <div className="fp-pot-face">
                <button
                  type="button"
                  className="fp-pot-channel"
                  disabled={!pot || !machine.powered}
                  title="Select for Pot. Einst. null-balance"
                  onClick={() => {
                    if (!pot) return
                    onSelect(pot.id)
                    if (machine.mode === 'potSet') onCalibratePot(pot.id)
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </button>
                <PotDial
                  value={k}
                  disabled={!pot || !machine.powered}
                  selected={selected}
                  label={pot?.label ?? `Pot ${i + 1}`}
                  onSelect={() => pot && onSelect(pot.id)}
                  onChange={(v) => pot && onCoefficient(pot.id, v)}
                />
              </div>
            </div>
          )
        })}
      </section>

      <div className="fp-main-row">
        {/* B. Patch pad */}
        <PatchBay
          machine={machine}
          selectedId={selectedId}
          onSelect={onSelect}
          onConnect={onConnect}
          onRemoveCable={onRemoveCable}
          onCableColor={onCableColor}
          onJumper={onJumper}
          onAutoShutdown={onAutoShutdown}
        />

        {/* C. Control panel */}
        <aside className="fp-controls">
          <Galvanometer
            value={
              machine.mode === 'potSet' ? meterDeflection : 0
            }
            caption={
              machine.mode === 'potSet'
                ? machine.calibratePotId
                  ? 'Nullabgleich'
                  : 'Pot. Einst. — Kanal wählen'
                : 'Kompensation'
            }
          />
          <label className="fp-master-ref">
            <span>R11 Master (10-turn)</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.0001}
              disabled={!machine.powered || machine.mode !== 'potSet'}
              value={machine.masterRef}
              onChange={(e) => onMasterRef(Number(e.target.value))}
            />
            <span className="fp-master-val">
              {(machine.masterRef * 10).toFixed(3)} V
            </span>
          </label>
          <fieldset className="fp-mode-grid">
            <legend className="fp-sr-only">Betriebsart</legend>
            {PANEL_BUTTONS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`fp-mode-btn tone-${b.tone}${machine.panelButton === b.id ? ' active' : ''}`}
                disabled={!machine.powered || (machine.externalSlave && b.id !== 'fremd')}
                onClick={() => onPanelButton(b.id)}
              >
                {b.label}
              </button>
            ))}
          </fieldset>
          <div className="fp-scope-slot">
            <XYScope machine={machine} />
          </div>
        </aside>
      </div>
    </div>
  )
}

function FunctionGeneratorField({
  fgs,
  powered,
  selectedId,
  onSelect,
  onFgBreakpoint,
}: {
  readonly fgs: { id: string; label: string; breakpoints?: { x: number; y: number }[] }[]
  readonly powered: boolean
  readonly selectedId: string | null
  readonly onSelect: (id: string | null) => void
  readonly onFgBreakpoint: (nodeId: string, index: number, y: number) => void
}) {
  const scaleLabels = useMemo(() => {
    return Array.from({ length: FG_KNOB_COUNT }, (_, i) =>
      String(Math.round(equidistantX(i))),
    )
  }, [])

  return (
    <section className="fp-fg-field" aria-label="Function generators F1 F2">
      <div className="fp-fg-scale" aria-hidden>
        <span className="fp-fg-scale-spacer" />
        {scaleLabels.map((lab, i) => (
          <span key={i} className="fp-fg-scale-tick">
            {lab}
          </span>
        ))}
      </div>
      {(['F1', 'F2'] as const).map((name, row) => {
        const fg =
          fgs.find((n) => n.id === `fg_${row + 1}`) ?? fgs[row]
        const pts = toEquidistantBreakpoints(fg?.breakpoints ?? [])
        const selected = fg?.id === selectedId
        return (
          <div
            key={name}
            className={`fp-fg-row ${fg ? '' : 'empty'} ${selected ? 'selected' : ''}`}
          >
            <span className="fp-fg-name">{name}</span>
            <div className="fp-fg-knobs">
              {pts.map((pt, i) => {
                // Map y ∈ [−10, +10] → dial rotation −135°…+135°
                const k = (pt.y + MACHINE_UNIT) / (2 * MACHINE_UNIT)
                return (
                  <FgKnob
                    key={i}
                    index={i}
                    value={pt.y}
                    k={k}
                    disabled={!fg || !powered}
                    label={`${name} x=${equidistantX(i).toFixed(1)} → ${pt.y.toFixed(2)} V`}
                    onSelect={() => fg && onSelect(fg.id)}
                    onChange={(y) => fg && onFgBreakpoint(fg.id, i, y)}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function FgKnob({
  index,
  value,
  k,
  disabled,
  label,
  onSelect,
  onChange,
}: {
  index: number
  value: number
  k: number
  disabled: boolean
  label: string
  onSelect: () => void
  onChange: (y: number) => void
}) {
  const onWheel = (e: ReactWheelEvent) => {
    if (disabled) return
    e.preventDefault()
    onSelect()
    const step = e.shiftKey ? 0.1 : 0.25
    const delta = e.deltaY > 0 ? -step : step
    onChange(
      Math.max(-MACHINE_UNIT, Math.min(MACHINE_UNIT, value + delta)),
    )
  }

  return (
    <button
      type="button"
      className="fp-fg-knob"
      disabled={disabled}
      title={label}
      aria-label={label}
      data-index={index}
      onClick={onSelect}
      onWheel={onWheel}
      onPointerDown={(e) => {
        if (disabled) return
        e.preventDefault()
        onSelect()
        const startY = e.clientY
        const startVal = value
        const target = e.currentTarget
        target.setPointerCapture(e.pointerId)
        const onMove = (ev: PointerEvent) => {
          const dy = startY - ev.clientY
          // ~40 px = full ±10 V
          const next = startVal + (dy / 40) * MACHINE_UNIT
          onChange(Math.max(-MACHINE_UNIT, Math.min(MACHINE_UNIT, next)))
        }
        const onUp = (ev: PointerEvent) => {
          target.releasePointerCapture(ev.pointerId)
          target.removeEventListener('pointermove', onMove)
          target.removeEventListener('pointerup', onUp)
        }
        target.addEventListener('pointermove', onMove)
        target.addEventListener('pointerup', onUp)
      }}
    >
      <span
        className="fp-fg-knob-dial"
        style={{ transform: `rotate(${-135 + k * 270}deg)` }}
      />
    </button>
  )
}

function PotDial({
  value,
  disabled,
  selected,
  label,
  onSelect,
  onChange,
}: {
  value: number
  disabled: boolean
  selected: boolean
  label: string
  onSelect: () => void
  onChange: (k: number) => void
}) {
  const onWheel = (e: ReactWheelEvent) => {
    if (disabled) return
    e.preventDefault()
    onSelect()
    const delta = e.deltaY > 0 ? -0.01 : 0.01
    onChange(Math.min(1, Math.max(0, value + delta)))
  }

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault()
        onChange(Math.min(1, value + (e.shiftKey ? 0.001 : 0.01)))
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault()
        onChange(Math.max(0, value - (e.shiftKey ? 0.001 : 0.01)))
      } else if (e.key === '0') {
        onChange(0)
      } else if (e.key === '1' && !e.shiftKey) {
        onChange(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, disabled, value, onChange])

  return (
    <button
      type="button"
      className={`fp-pot-dial-btn ${selected ? 'selected' : ''}`}
      disabled={disabled}
      title={`${label}: k=${value.toFixed(3)} — scroll / arrows`}
      onClick={onSelect}
      onWheel={onWheel}
    >
      <span className="fp-pot-dial">
        <span
          className="fp-pot-knob"
          style={{ transform: `rotate(${-135 + value * 270}deg)` }}
        />
      </span>
      <span className="fp-pot-k">{value.toFixed(3)}</span>
    </button>
  )
}

function Galvanometer({
  value,
  caption,
}: {
  value: number
  caption: string
}) {
  const clamped = Math.max(-10, Math.min(10, value))
  const angle = (clamped / 10) * 55
  return (
    <div className="fp-galvo" title={`${caption}: ${value.toFixed(3)} V`}>
      <svg viewBox="0 0 160 100" className="fp-meter-svg" aria-hidden>
        <path
          d="M 18 78 A 62 62 0 0 1 142 78"
          fill="#f7f3e8"
          stroke="#1a1814"
          strokeWidth="2"
        />
        {[-10, -5, 0, 5, 10].map((tick) => {
          const a = ((tick / 10) * 55 * Math.PI) / 180
          return (
            <line
              key={tick}
              x1={80 + Math.sin(a) * 40}
              y1={78 - Math.cos(a) * 40}
              x2={80 + Math.sin(a) * 48}
              y2={78 - Math.cos(a) * 48}
              stroke="#1a1814"
              strokeWidth={tick === 0 ? 1.8 : 1}
            />
          )
        })}
        <line
          x1="80"
          y1="78"
          x2={80 + Math.sin((angle * Math.PI) / 180) * 44}
          y2={78 - Math.cos((angle * Math.PI) / 180) * 44}
          stroke="#a02828"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="80" cy="78" r="3.5" fill="#1a1814" />
        <text x="80" y="96" textAnchor="middle" className="fp-meter-unit">
          0
        </text>
      </svg>
      <div className="fp-meter-caption">{caption}</div>
    </div>
  )
}

function PatchBay({
  machine,
  selectedId,
  onSelect,
  onConnect,
  onRemoveCable,
  onCableColor,
  onJumper,
  onAutoShutdown,
}: {
  machine: MachineState
  selectedId: string | null
  onSelect: (id: string | null) => void
  onConnect: (from: PortRef, to: PortRef, color?: string) => void
  onRemoveCable: (cableId: string) => void
  onCableColor: (cableId: string, color: string) => void
  onJumper: (jumper: JumperPlacement) => void
  onAutoShutdown: (on: boolean) => void
}) {
  const cells = useMemo(() => buildPatchLayout(machine.nodes), [machine.nodes])
  const silkTies = useMemo(() => buildSilkTies(), [])
  const silkSections = useMemo(() => buildSilkSectionLines(), [])
  const bayRef = useRef<HTMLDivElement>(null)
  const [dragFrom, setDragFrom] = useState<PortRef | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [hoverCable, setHoverCable] = useState<string | null>(null)
  const [menu, setMenu] = useState<{
    cableId: string
    x: number
    y: number
  } | null>(null)
  const [jumperTool, setJumperTool] = useState<'mode4' | 'time2' | null>(null)

  const connectedKeys = useMemo(() => {
    const set = new Set<string>()
    for (const c of machine.cables) {
      set.add(portKey(c.from))
      set.add(portKey(c.to))
    }
    return set
  }, [machine.cables])

  const toGrid = useCallback((e: ReactPointerEvent | PointerEvent) => {
    const el = bayRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * PATCH_COLS,
      y: ((e.clientY - rect.top) / rect.height) * PATCH_ROWS,
    }
  }, [])

  const onJackPointerDown = (c: PatchCell, e: ReactPointerEvent) => {
    if (!c.ref || c.unused) return
    e.stopPropagation()
    onSelect(c.ref.nodeId)
    if (c.direction === 'out') {
      setDragFrom(c.ref)
      setCursor(toGrid(e))
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }
  }

  const onBayPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragFrom) return
    setCursor(toGrid(e))
  }

  const onBayPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragFrom) return
    const { x, y } = toGrid(e)
    const col = Math.floor(x)
    const row = Math.floor(y)
    const target = cells.find((c) => c.col === col && c.row === row)
    if (target?.ref && target.direction === 'in') {
      onConnect(dragFrom, target.ref)
    }
    setDragFrom(null)
    setCursor(null)
  }

  const placeJumperOnCol = (col0: number) => {
    if (!jumperTool) return
    const col1 = col0 + 1
    const block = SWITCHABLE_BLOCKS.find((b) => b.cols[0] === col1)
    if (!block) return
    if (jumperTool === 'mode4') {
      const existing = machine.jumpers.find(
        (j) => j.ampSlot === block.ampSlot && j.kind === 'mode4',
      )
      const nextPos =
        existing?.position === 'sigma' ? 'integral' : 'sigma'
      if (!isLegalModeJumper(col1, nextPos)) return
      onJumper({
        id: `jmode_${block.ampSlot}`,
        kind: 'mode4',
        ampSlot: block.ampSlot,
        position: nextPos,
      })
    } else {
      const existing = machine.jumpers.find(
        (j) => j.ampSlot === block.ampSlot && j.kind === 'time2',
      )
      const nextPos = existing?.position === '1' ? '10' : '1'
      if (!isLegalTimeJumper(col1, nextPos)) return
      onJumper({
        id: `jtime_${block.ampSlot}`,
        kind: 'time2',
        ampSlot: block.ampSlot,
        position: nextPos,
      })
    }
    setJumperTool(null)
  }

  // AS short detect: violet jacks col 1 rows n/o — toggle autoShutdown when both "used"
  // Simplified: clicking tray AS button
  const asShorted = machine.autoShutdown

  return (
    <div className="fp-bay-wrap">
      <div className="fp-jumper-tray">
        <span className="fp-tray-label">Stecker</span>
        <button
          type="button"
          className={`fp-jumper-tool ${jumperTool === 'mode4' ? 'active' : ''}`}
          onClick={() =>
            setJumperTool((t) => (t === 'mode4' ? null : 'mode4'))
          }
          title="4-pin Umschaltstecker Σ / ∫ — click switchable column"
        >
          4-pin Σ/∫
        </button>
        <button
          type="button"
          className={`fp-jumper-tool ${jumperTool === 'time2' ? 'active' : ''}`}
          onClick={() =>
            setJumperTool((t) => (t === 'time2' ? null : 'time2'))
          }
          title="2-pin time constant 1 / 10"
        >
          2-pin 1/10
        </button>
        <button
          type="button"
          className={`fp-jumper-tool ${asShorted ? 'active' : ''}`}
          onClick={() => onAutoShutdown(!asShorted)}
          title="Abschaltleitung (AS) — overload → Halt"
        >
          AS
        </button>
      </div>

      <div
        ref={bayRef}
        className={`fp-patchbay v2${dragFrom ? ' patching' : ''}${jumperTool ? ' jumper-mode' : ''}`}
        style={{
          gridTemplateColumns: `repeat(${PATCH_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${PATCH_ROWS}, 1fr)`,
        }}
        onPointerMove={onBayPointerMove}
        onPointerUp={onBayPointerUp}
        onPointerLeave={() => {
          if (dragFrom) {
            setDragFrom(null)
            setCursor(null)
          }
        }}
        onClick={() => setMenu(null)}
      >
        <svg
          className="fp-patch-silk"
          viewBox={`0 0 ${PATCH_COLS} ${PATCH_ROWS}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {silkSections.map((s, i) => (
            <line
              key={`section-${i}`}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              className="fp-silk-section"
            />
          ))}
          {silkTies.map((s, i) => (
            <line
              key={`silk-${i}`}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              className="fp-silk-tie"
            />
          ))}
          {FREE_DIODE_BLOCKS.flatMap((block) =>
            freeDiodeColPairs(block.cols).flatMap(([c0, c1]) =>
              FREE_DIODE_VERTICAL_PAIRS.map(([r0, r1]) => {
                // Legs run from left vertical-tie center to right vertical-tie center.
                const x = (c0 + c1) / 2 - 0.5
                const y = (rowIndex(r0) + rowIndex(r1) + 1) / 2
                const half = (c1 - c0) / 2
                const right = freeDiodePairPointsRight([r0, r1])
                // Triangle points at the cathode bar (top →, bottom ←).
                const tri = right
                  ? 'M -0.12 -0.1 L -0.12 0.1 L 0.08 0 Z'
                  : 'M 0.12 -0.1 L 0.12 0.1 L -0.08 0 Z'
                const barX = right ? 0.12 : -0.12
                return (
                  <g
                    key={`diode-${c0}-${c1}-${r0}-${r1}`}
                    className="fp-silk-diode"
                    transform={`translate(${x} ${y})`}
                  >
                    <line x1={-half} y1={0} x2={-0.12} y2={0} />
                    <path d={tri} />
                    <line x1={barX} y1={-0.12} x2={barX} y2={0.12} />
                    <line x1={0.12} y1={0} x2={half} y2={0} />
                  </g>
                )
              }),
            ),
          )}
        </svg>
        {/* Amp numbers between k and l — overlay grid so labels don't steal
            auto-placed jack cells. Mode Σ/∫ sit once in the center of each
            4-jack Umschaltstecker block (not per hole). */}
        <div
          className="fp-amp-labels"
          aria-hidden
          style={{
            gridTemplateColumns: `repeat(${PATCH_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${PATCH_ROWS}, 1fr)`,
          }}
        >
          {AMP_STRIPS.map((strip) => {
            const [left, right] = strip.cols
            const k = rowIndex('k')
            return (
              <span
                key={`amp-label-${strip.amp}`}
                className="fp-amp-strip-label"
                style={{
                  gridColumn: `${left} / ${right + 1}`,
                  gridRow: `${k + 1} / ${k + 3}`,
                }}
              >
                {String(strip.amp).padStart(2, '0')}
              </span>
            )
          })}
          {SWITCHABLE_BLOCKS.map((block) => {
            const [left, right] = block.cols
            const a = rowIndex('a')
            const b = rowIndex('b')
            const c = rowIndex('c')
            return (
              <Fragment key={`mode-silk-${block.amp}`}>
                <span
                  className="fp-mode-silk-label"
                  style={{
                    gridColumn: `${left} / ${right + 1}`,
                    gridRow: `${a + 1} / ${b + 2}`,
                  }}
                >
                  Σ
                </span>
                <span
                  className="fp-mode-silk-label"
                  style={{
                    gridColumn: `${left} / ${right + 1}`,
                    gridRow: `${b + 1} / ${c + 2}`,
                  }}
                >
                  ∫
                </span>
              </Fragment>
            )
          })}
          {(
            [
              ['F1', FG_COLS.F1],
              ['F2', FG_COLS.F2],
            ] as const
          ).map(([name, col1]) => (
            <span
              key={`fg-silk-${name}`}
              className="fp-fg-silk-label"
              style={{
                gridColumn: col1,
                /* Span rows a–b so the label sits midway between the two jacks */
                gridRow: `${rowIndex('a') + 1} / ${rowIndex('b') + 2}`,
              }}
            >
              {name}
            </span>
          ))}
          {MULTIPLIER_BANKS.flatMap((bank) => {
            const [c0, c1] = bank.cols
            const labels = ['+X', '+Y', '−X', '−Y'] as const
            return labels.map((label, row) => (
              <span
                key={`mult-silk-${bank.index}-${label}`}
                className="fp-mult-silk-label"
                style={{
                  gridColumn: `${c0} / ${c1 + 1}`,
                  gridRow: row + 1,
                }}
              >
                {label}
              </span>
            ))
          })}
        </div>
        <svg
          className="fp-patch-cables"
          viewBox={`0 0 ${PATCH_COLS} ${PATCH_ROWS}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {machine.cables.map((cable) => {
            const a = findPortCell(cells, cable.from)
            const b = findPortCell(cells, cable.to)
            if (!a || !b) return null
            const x1 = a.col + 0.5
            const y1 = a.row + 0.5
            const x2 = b.col + 0.5
            const y2 = b.row + 0.5
            const mx = (x1 + x2) / 2
            const stroke = cable.color ?? '#c45c26'
            const hot = hoverCable === cable.id
            return (
              <path
                key={cable.id}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                className={`fp-cable${hot ? ' hover' : ''}`}
                stroke={stroke}
                fill="none"
                onMouseEnter={() => setHoverCable(cable.id)}
                onMouseLeave={() => setHoverCable(null)}
                onClick={(ev) => {
                  ev.stopPropagation()
                  const rect = bayRef.current?.getBoundingClientRect()
                  setMenu({
                    cableId: cable.id,
                    x: ev.clientX - (rect?.left ?? 0),
                    y: ev.clientY - (rect?.top ?? 0),
                  })
                }}
              />
            )
          })}
          {/* Jumper blocks — mode4 is a 4-pin Umschaltstecker spanning both
              strip columns × two rows (a–b or b–c). time2 is a horizontal
              2-pin capacitor short on row d (same holes for 1 and 10). */}
          {machine.jumpers.map((j) => {
            const block = SWITCHABLE_BLOCKS.find((b) => b.ampSlot === j.ampSlot)
            if (!block) return null
            const [r0, r1] = jumperRowSpan(j.kind, j.position)
            const row0 = ROW_LETTERS.indexOf(r0)
            const row1 = ROW_LETTERS.indexOf(r1)
            const col = block.cols[0] - 1
            const y = Math.min(row0, row1)
            const h = Math.max(1, Math.abs(row1 - row0) + 1)
            if (j.kind === 'mode4') {
              return (
                <rect
                  key={j.id}
                  x={col + 0.12}
                  y={y + 0.12}
                  width={1.76}
                  height={h - 0.24}
                  rx={0.12}
                  className="fp-jumper-block kind-mode4"
                />
              )
            }
            // Horizontal 2-pin on row d across both strip columns.
            return (
              <rect
                key={j.id}
                x={col + 0.12}
                y={y + 0.28}
                width={1.76}
                height={0.44}
                rx={0.1}
                className="fp-jumper-block kind-time2"
              />
            )
          })}
          {dragFrom &&
            cursor &&
            (() => {
              const a = findPortCell(cells, dragFrom)
              if (!a) return null
              const x1 = a.col + 0.5
              const y1 = a.row + 0.5
              const mx = (x1 + cursor.x) / 2
              return (
                <path
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${cursor.y}, ${cursor.x} ${cursor.y}`}
                  className="fp-cable preview"
                  fill="none"
                  pointerEvents="none"
                />
              )
            })()}
        </svg>

        {cells.map((c) => {
          const live = !!c.ref && !c.unused
          const key = c.ref ? portKey(c.ref) : `${c.col},${c.row}`
          const lit = live && connectedKeys.has(key)
          const selected = live && c.ref?.nodeId === selectedId
          const leftCol1 = c.col + 1
          const jumperTarget =
            jumperTool && SWITCHABLE_LEFT_COLS.includes(leftCol1 as never)
          const mark = c.mark ? (
            <span className="fp-jack-mark" aria-hidden>
              {c.mark}
            </span>
          ) : null

          if (!live) {
            return (
              <div
                key={`${c.col},${c.row}`}
                className={`fp-jack-cell${jumperTarget ? ' jumper-target' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (jumperTool) placeJumperOnCol(c.col)
                }}
              >
                {mark}
                <span
                  className={`fp-jack color-${c.color} unused`}
                  title={c.label || c.jackId}
                />
              </div>
            )
          }

          return (
            <div key={`${c.col},${c.row}-${key}`} className="fp-jack-cell">
              {mark}
              <button
                type="button"
                className={`fp-jack color-${c.color}${lit ? ' lit' : ''}${selected ? ' selected' : ''}`}
                title={`${c.label} (${c.direction})`}
                onPointerDown={(e) => onJackPointerDown(c, e)}
                onClick={(e) => {
                  e.stopPropagation()
                  if (jumperTool) placeJumperOnCol(c.col)
                }}
              />
            </div>
          )
        })}

        {menu && (
          <div
            className="fp-cable-menu"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onRemoveCable(menu.cableId)
                setMenu(null)
              }}
            >
              Delete wire
            </button>
            {CABLE_COLORS.map((col) => (
              <button
                key={col}
                type="button"
                className="fp-color-swatch"
                style={{ background: col }}
                onClick={() => {
                  onCableColor(menu.cableId, col)
                  setMenu(null)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


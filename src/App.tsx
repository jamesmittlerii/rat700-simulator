import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  addCable,
  addElement,
  createEmptyMachine,
  fromSnapshot,
  removeCable,
  removeNode,
  resetTime,
  setCableColor,
  setCalibratePot,
  setCoefficient,
  setFgBreakpoint,
  setInitialCondition,
  setJumper,
  setMasterRef,
  setPanelButton,
  setSignalParams,
  setMode,
  stepMachine,
  toSnapshot,
  moveNode,
  type MachineState,
} from './engine/circuit'
import type {
  ElementKind,
  JumperPlacement,
  MachineMode,
  PanelButton,
  PortRef,
} from './engine/types'
import { loadHarmonicOscillator } from './presets/harmonicOscillator'
import {
  loadVehicleSuspension,
  VEHICLE_NODES,
} from './presets/vehicleSuspension'
import { loadLorenzAttractor, LORENZ_NODES } from './presets/lorenzAttractor'
import { loadRosslerAttractor, ROSSLER_NODES } from './presets/rosslerAttractor'
import { loadVanDerPol, VAN_DER_POL_NODES } from './presets/vanDerPol'
import { loadMathieuEquation, MATHIEU_NODES } from './presets/mathieuEquation'
import { loadDuffingOscillator, DUFFING_NODES } from './presets/duffingOscillator'
import {
  loadSoftSpringThreeBody,
  SOFT_SPRING_NODES,
} from './presets/softSpringThreeBody'
import { Controls } from './ui/Controls'
import { FrontPanel } from './ui/FrontPanel'
import { SchematicCanvas } from './ui/SchematicCanvas'
import { XYScope, type XYScopeHandle } from './ui/XYScope'
import './App.css'

const STORAGE_KEY = 'rat700-patch-v2'
const SCOPE_HEIGHT_KEY = 'rat700-scope-height'
const WORKSPACE_TAB_KEY = 'rat700-workspace-tab'
const SCOPE_HEIGHT_DEFAULT = 220
const SCOPE_HEIGHT_MIN = 140
const SCOPE_HEIGHT_MAX = 560

type WorkspaceTab = 'schematic' | 'frontPanel'

export default function App() {
  const [machine, setMachine] = useState<MachineState>(() =>
    setPanelButton(loadVehicleSuspension('firm'), 'dauer'),
  )
  const [selectedId, setSelectedId] = useState<string | null>(VEHICLE_NODES.body)
  const [status, setStatus] = useState<string | undefined>()
  const [activePreset, setActivePreset] = useState<
    | 'oscillator'
    | 'vehicle-firm'
    | 'vehicle-soft'
    | 'lorenz'
    | 'rossler'
    | 'vanDerPol'
    | 'mathieu'
    | 'duffing'
    | 'softSpring'
    | null
  >('vehicle-firm')
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(() => {
    const raw = localStorage.getItem(WORKSPACE_TAB_KEY)
    if (raw === 'schematic') return 'schematic'
    return 'frontPanel'
  })
  const [scopeHeight, setScopeHeight] = useState(() => {
    const raw = localStorage.getItem(SCOPE_HEIGHT_KEY)
    const n = raw ? Number(raw) : SCOPE_HEIGHT_DEFAULT
    return Number.isFinite(n)
      ? Math.min(SCOPE_HEIGHT_MAX, Math.max(SCOPE_HEIGHT_MIN, n))
      : SCOPE_HEIGHT_DEFAULT
  })
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)
  // machineRef is the single source of truth for the live simulation; React
  // state (`machine`) is a throttled mirror used only for rendering the UI.
  const machineRef = useRef(machine)
  const scopeRef = useRef<XYScopeHandle>(null)

  const selectWorkspaceTab = useCallback((tab: WorkspaceTab) => {
    setWorkspaceTab(tab)
    localStorage.setItem(WORKSPACE_TAB_KEY, tab)
  }, [])

  const onSplitterPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      dragRef.current = { startY: e.clientY, startH: scopeHeight }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [scopeHeight],
  )

  const onSplitterPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return
      const dy = e.clientY - dragRef.current.startY
      const next = Math.min(
        SCOPE_HEIGHT_MAX,
        Math.max(SCOPE_HEIGHT_MIN, dragRef.current.startH + dy),
      )
      setScopeHeight(next)
    },
    [],
  )

  const onSplitterPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return
      dragRef.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
      setScopeHeight((h) => {
        localStorage.setItem(SCOPE_HEIGHT_KEY, String(h))
        return h
      })
    },
    [],
  )

  const commitMachine = useCallback(
    (updater: MachineState | ((m: MachineState) => MachineState)) => {
      // Always derive from the live ref (not throttled React state) so edits
      // during Operate never rewind the simulation.
      const next =
        typeof updater === 'function' ? updater(machineRef.current) : updater
      machineRef.current = next
      setMachine(next)
    },
    [],
  )

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastFlush = last
    const tick = (now: number) => {
      const wallDt = Math.min(0.05, (now - last) / 1000)
      last = now
      const m = machineRef.current
      if (m.powered && m.mode === 'operate') {
        const next = stepMachine(m, wallDt, { captureScope: true })
        machineRef.current = next
        // Draw the scope every frame (smooth trace) without re-rendering React.
        scopeRef.current?.feed(next)
        // Throttle the React mirror (sidebar/faceplate) to ~15 Hz, but flush
        // immediately when the mode changes (e.g. overload auto-shutdown).
        if (next.mode !== m.mode || now - lastFlush >= 66) {
          lastFlush = now
          setMachine(next)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onMode = useCallback(
    (mode: MachineMode) => {
      commitMachine((m) => setMode(m, mode))
    },
    [commitMachine],
  )

  const onPanelButton = useCallback(
    (btn: PanelButton) => {
      commitMachine((m) => setPanelButton(m, btn))
    },
    [commitMachine],
  )

  const onAdd = useCallback(
    (kind: 'potentiometer' | 'summer' | 'integrator' | 'inverter') => {
      commitMachine((m) => {
        const { machine: next, error } = addElement(
          m,
          kind as ElementKind,
          320,
          180,
        )
        if (error) setStatus(error)
        else setStatus(undefined)
        return next
      })
    },
    [commitMachine],
  )

  const onConnect = useCallback(
    (from: PortRef, to: PortRef, color?: string) => {
      commitMachine((m) => {
        const { machine: next, error } = addCable(m, from, to, color)
        if (error) setStatus(error)
        return next
      })
    },
    [commitMachine],
  )

  const handleLoadSaved = useCallback(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      setStatus('No saved patch found.')
      return
    }
    try {
      const snap = JSON.parse(raw)
      commitMachine(fromSnapshot(snap))
      setActivePreset(null)
      setStatus('Patch loaded.')
    } catch {
      setStatus('Failed to load saved patch.')
    }
  }, [commitMachine])

  const handleSave = useCallback(() => {
    const snap = toSnapshot(machineRef.current)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap))
    setStatus('Patch saved to browser storage.')
  }, [])

  return (
    <div className="app">
      <Controls
        machine={machine}
        selectedId={selectedId}
        onMode={onMode}
        onPower={(on) => commitMachine((m) => ({ ...m, powered: on }))}
        onTimeScale={(v) => commitMachine((m) => ({ ...m, timeScale: v }))}
        onReset={() => commitMachine((m) => resetTime(m))}
        onAdd={onAdd}
        onLoadOscillator={() => {
          commitMachine(loadHarmonicOscillator())
          setSelectedId('int_1')
          setActivePreset('oscillator')
          setStatus('Loaded harmonic oscillator preset.')
        }}
        onLoadVehicle={(damping) => {
          commitMachine(loadVehicleSuspension(damping))
          setSelectedId(VEHICLE_NODES.body)
          setActivePreset(damping === 'firm' ? 'vehicle-firm' : 'vehicle-soft')
          setStatus(
            damping === 'firm'
              ? 'Loaded vehicle suspension (firm damping).'
              : 'Loaded vehicle suspension (soft damping — Caprice-style).',
          )
        }}
        onLoadLorenz={() => {
          commitMachine(loadLorenzAttractor())
          setSelectedId(LORENZ_NODES.x)
          setActivePreset('lorenz')
          setStatus('Loaded Lorenz attractor preset — press Compute (Operate).')
        }}
        onLoadRossler={() => {
          commitMachine(loadRosslerAttractor())
          setSelectedId(ROSSLER_NODES.x)
          setActivePreset('rossler')
          setStatus('Loaded Rössler attractor preset — press Compute (Operate).')
        }}
        onLoadVanDerPol={() => {
          commitMachine(loadVanDerPol())
          setSelectedId(VAN_DER_POL_NODES.x)
          setActivePreset('vanDerPol')
          setStatus('Loaded Van der Pol oscillator — press Compute (Operate).')
        }}
        onLoadMathieu={() => {
          commitMachine(loadMathieuEquation())
          setSelectedId(MATHIEU_NODES.x)
          setActivePreset('mathieu')
          setStatus('Loaded Mathieu equation — press Compute (Operate).')
        }}
        onLoadDuffing={() => {
          commitMachine(loadDuffingOscillator())
          setSelectedId(DUFFING_NODES.x)
          setActivePreset('duffing')
          setStatus('Loaded Duffing oscillator — press Compute (Operate).')
        }}
        onLoadSoftSpring={() => {
          commitMachine(loadSoftSpringThreeBody())
          setSelectedId(SOFT_SPRING_NODES.xA)
          setActivePreset('softSpring')
          setStatus(
            'Loaded soft-spring three-body — press Compute (Operate).',
          )
        }}
        onSave={handleSave}
        onLoad={handleLoadSaved}
        onClear={() => {
          commitMachine(createEmptyMachine())
          setSelectedId(null)
          setActivePreset(null)
          setStatus('Cleared to empty patch bay.')
        }}
        onCoefficient={(id, k) => commitMachine((m) => setCoefficient(m, id, k))}
        onIC={(id, v) => commitMachine((m) => setInitialCondition(m, id, v))}
        onSignal={(id, params) =>
          commitMachine((m) => setSignalParams(m, id, params))
        }
        onDeleteSelected={() => {
          if (!selectedId) return
          commitMachine((m) => removeNode(m, selectedId))
          setSelectedId(null)
        }}
        activePreset={activePreset}
        status={status}
      />

      <main className="workspace">
        <div className="workspace-tabs" role="tablist" aria-label="Workspace view">
          <button
            type="button"
            role="tab"
            id="tab-schematic"
            aria-selected={workspaceTab === 'schematic'}
            aria-controls="panel-schematic"
            className={
              workspaceTab === 'schematic' ? 'workspace-tab active' : 'workspace-tab'
            }
            onClick={() => selectWorkspaceTab('schematic')}
          >
            Schematic
          </button>
          <button
            type="button"
            role="tab"
            id="tab-front-panel"
            aria-selected={workspaceTab === 'frontPanel'}
            aria-controls="panel-front-panel"
            className={
              workspaceTab === 'frontPanel' ? 'workspace-tab active' : 'workspace-tab'
            }
            onClick={() => selectWorkspaceTab('frontPanel')}
          >
            Front panel
          </button>
        </div>

        {workspaceTab === 'schematic' ? (
          <div
            className="workspace-panel"
            role="tabpanel"
            id="panel-schematic"
            aria-labelledby="tab-schematic"
          >
            <div className="readouts" style={{ height: scopeHeight }}>
              <XYScope ref={scopeRef} machine={machine} />
            </div>
            <hr
              className="workspace-splitter"
              aria-orientation="horizontal"
              aria-valuenow={scopeHeight}
              aria-valuemin={SCOPE_HEIGHT_MIN}
              aria-valuemax={SCOPE_HEIGHT_MAX}
              aria-label="Resize scope"
              onPointerDown={onSplitterPointerDown}
              onPointerMove={onSplitterPointerMove}
              onPointerUp={onSplitterPointerUp}
              onPointerCancel={onSplitterPointerUp}
            />
            <SchematicCanvas
              machine={machine}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMoveNode={(id, x, y) =>
                commitMachine((m) => moveNode(m, id, x, y))
              }
              onConnect={onConnect}
              onRemoveCable={(id) => commitMachine((m) => removeCable(m, id))}
            />
          </div>
        ) : (
          <div
            className="workspace-panel front-panel-host"
            role="tabpanel"
            id="panel-front-panel"
            aria-labelledby="tab-front-panel"
          >
            <FrontPanel
              machine={machine}
              scopeRef={scopeRef}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPanelButton={onPanelButton}
              onPower={(on) => commitMachine((m) => ({ ...m, powered: on }))}
              onCoefficient={(id, k) =>
                commitMachine((m) => setCoefficient(m, id, k))
              }
              onConnect={onConnect}
              onRemoveCable={(id) => commitMachine((m) => removeCable(m, id))}
              onCableColor={(id, color) =>
                commitMachine((m) => setCableColor(m, id, color))
              }
              onJumper={(j: JumperPlacement) =>
                commitMachine((m) => setJumper(m, j))
              }
              onMasterRef={(v) => commitMachine((m) => setMasterRef(m, v))}
              onCalibratePot={(id) =>
                commitMachine((m) => setCalibratePot(m, id))
              }
              onAutoShutdown={(on) =>
                commitMachine((m) => ({ ...m, autoShutdown: on }))
              }
              onFgBreakpoint={(id, index, y) =>
                commitMachine((m) => setFgBreakpoint(m, id, index, y))
              }
            />
          </div>
        )}
      </main>
    </div>
  )
}

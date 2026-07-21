import type { MachineMode } from '../engine/types'
import type { MachineState } from '../engine/circuit'

const MODE_LABELS: Record<MachineMode, string> = {
  potSet: 'Pot. Set',
  ic: 'Pause (IC)',
  operate: 'Compute',
  hold: 'Hold (Halt)',
}

interface ControlsProps {
  readonly machine: MachineState
  readonly selectedId: string | null
  readonly onMode: (mode: MachineMode) => void
  readonly onPower: (on: boolean) => void
  readonly onTimeScale: (v: number) => void
  readonly onReset: () => void
  readonly onAdd: (kind: 'potentiometer' | 'summer' | 'integrator' | 'inverter') => void
  readonly onLoadOscillator: () => void
  readonly onLoadVehicle: (damping: 'firm' | 'soft') => void
  readonly onLoadLorenz: () => void
  readonly onLoadRossler: () => void
  readonly onLoadVanDerPol: () => void
  readonly onLoadMathieu: () => void
  readonly onLoadDuffing: () => void
  readonly onLoadSoftSpring: () => void
  readonly onLoadChua: () => void
  readonly onSave: () => void
  readonly onLoad: () => void
  readonly onClear: () => void
  readonly onCoefficient: (id: string, k: number) => void
  readonly onIC: (id: string, v: number) => void
  readonly onSignal: (id: string, params: { amplitude?: number; frequency?: number }) => void
  readonly onDeleteSelected: () => void
  readonly activePreset?:
    | 'oscillator'
    | 'vehicle-firm'
    | 'vehicle-soft'
    | 'lorenz'
    | 'rossler'
    | 'vanDerPol'
    | 'mathieu'
    | 'duffing'
    | 'softSpring'
    | 'chua'
    | null
  readonly status?: string
}

export function Controls({
  machine,
  selectedId,
  onMode,
  onPower,
  onTimeScale,
  onReset,
  onAdd,
  onLoadOscillator,
  onLoadVehicle,
  onLoadLorenz,
  onLoadRossler,
  onLoadVanDerPol,
  onLoadMathieu,
  onLoadDuffing,
  onLoadSoftSpring,
  onLoadChua,
  onSave,
  onLoad,
  onClear,
  onCoefficient,
  onIC,
  onSignal,
  onDeleteSelected,
  activePreset = null,
  status,
}: ControlsProps) {
  const selected = machine.nodes.find((n) => n.id === selectedId)
  const overloadCount = machine.lastEval.overloaded.size
  const modes: MachineMode[] = ['potSet', 'ic', 'operate', 'hold']

  return (
    <aside className="controls">
      <header className="brand">
        <h1>RAT 700</h1>
        <p className="tagline">Analog computer simulator</p>
      </header>

      <section>
        <h2>Power</h2>
        <button
          type="button"
          className={machine.powered ? 'btn power on' : 'btn power'}
          onClick={() => onPower(!machine.powered)}
        >
          {machine.powered ? 'Power On' : 'Power Off'}
        </button>
      </section>

      <section>
        <h2>Mode</h2>
        <div className="mode-grid">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              className={
                machine.mode === m ? `btn mode active mode-${m}` : `btn mode mode-${m}`
              }
              onClick={() => onMode(m)}
              disabled={!machine.powered}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Time scale</h2>
        <label className="slider-row">
          <span>{machine.timeScale.toFixed(2)}×</span>
          <input
            type="range"
            min={0.05}
            max={12}
            step={0.05}
            value={machine.timeScale}
            onChange={(e) => onTimeScale(Number(e.target.value))}
          />
        </label>
        <p className="meta">t = {machine.time.toFixed(3)} s</p>
        <button type="button" className="btn" onClick={onReset}>
          Reset to IC
        </button>
      </section>

      <section>
        <h2>Add element</h2>
        <div className="add-grid">
          <button type="button" className="btn" onClick={() => onAdd('integrator')}>
            Integrator
          </button>
          <button type="button" className="btn" onClick={() => onAdd('summer')}>
            Summer
          </button>
          <button type="button" className="btn" onClick={() => onAdd('inverter')}>
            Inverter
          </button>
          <button type="button" className="btn" onClick={() => onAdd('potentiometer')}>
            Potentiometer
          </button>
        </div>
      </section>

      <section>
        <h2>Presets &amp; storage</h2>
        <div className="add-grid">
          <button
            type="button"
            className={
              activePreset === 'oscillator' ? 'btn primary' : 'btn'
            }
            onClick={onLoadOscillator}
          >
            Harmonic oscillator
          </button>
          <button
            type="button"
            className={
              activePreset === 'vehicle-firm' ? 'btn primary' : 'btn'
            }
            onClick={() => onLoadVehicle('firm')}
          >
            Vehicle (firm damp)
          </button>
          <button
            type="button"
            className={
              activePreset === 'vehicle-soft' ? 'btn primary' : 'btn'
            }
            onClick={() => onLoadVehicle('soft')}
          >
            Vehicle (soft damp)
          </button>
          <button
            type="button"
            className={activePreset === 'lorenz' ? 'btn primary' : 'btn'}
            onClick={onLoadLorenz}
          >
            Lorenz attractor
          </button>
          <button
            type="button"
            className={activePreset === 'rossler' ? 'btn primary' : 'btn'}
            onClick={onLoadRossler}
          >
            Rössler attractor
          </button>
          <button
            type="button"
            className={activePreset === 'vanDerPol' ? 'btn primary' : 'btn'}
            onClick={onLoadVanDerPol}
          >
            Van der Pol
          </button>
          <button
            type="button"
            className={activePreset === 'mathieu' ? 'btn primary' : 'btn'}
            onClick={onLoadMathieu}
          >
            Mathieu equation
          </button>
          <button
            type="button"
            className={activePreset === 'duffing' ? 'btn primary' : 'btn'}
            onClick={onLoadDuffing}
          >
            Duffing oscillator
          </button>
          <button
            type="button"
            className={activePreset === 'softSpring' ? 'btn primary' : 'btn'}
            onClick={onLoadSoftSpring}
          >
            Soft-spring 3-body
          </button>
          <button
            type="button"
            className={activePreset === 'chua' ? 'btn primary' : 'btn'}
            onClick={onLoadChua}
          >
            Chua’s circuit
          </button>
          <button type="button" className="btn" onClick={onSave}>
            Save patch
          </button>
          <button type="button" className="btn" onClick={onLoad}>
            Load patch
          </button>
          <button type="button" className="btn" onClick={onClear}>
            Clear patch
          </button>
        </div>
      </section>

      {selected && (
        <section>
          <h2>Selected: {selected.label}</h2>
          {selected.kind === 'potentiometer' && (
            <label className="slider-row">
              <span>Coefficient k = {(selected.coefficient ?? 0).toFixed(3)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={selected.coefficient ?? 0}
                onChange={(e) => onCoefficient(selected.id, Number(e.target.value))}
              />
            </label>
          )}
          {selected.kind === 'integrator' && (
            <label className="slider-row">
              <span>
                Initial condition = {(selected.initialCondition ?? 0).toFixed(2)} V
              </span>
              <input
                type="range"
                min={-10}
                max={10}
                step={0.1}
                value={selected.initialCondition ?? 0}
                onChange={(e) => onIC(selected.id, Number(e.target.value))}
              />
            </label>
          )}
          {selected.kind === 'signal' && (
            <>
              <label className="slider-row">
                <span>Amplitude = {(selected.amplitude ?? 0).toFixed(2)} V</span>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.05}
                  value={selected.amplitude ?? 0}
                  onChange={(e) =>
                    onSignal(selected.id, { amplitude: Number(e.target.value) })
                  }
                />
              </label>
              <label className="slider-row">
                <span>
                  Noise bandwidth ≈ {(selected.frequency ?? 0).toFixed(2)} rad/s
                </span>
                <input
                  type="range"
                  min={0.2}
                  max={8}
                  step={0.1}
                  value={selected.frequency ?? 0}
                  onChange={(e) =>
                    onSignal(selected.id, { frequency: Number(e.target.value) })
                  }
                />
              </label>
            </>
          )}
          {selected.kind !== 'reference' && (
            <button type="button" className="btn danger" onClick={onDeleteSelected}>
              Delete element
            </button>
          )}
        </section>
      )}

      <section className="status-block">
        {overloadCount > 0 && (
          <p className="warn">Overload on {overloadCount} amplifier(s)</p>
        )}
        {machine.lastEval.warning && (
          <p className="warn">{machine.lastEval.warning}</p>
        )}
        {status && <p className="meta">{status}</p>}
        <p className="hint">
          Schematic or Front panel: patch from red/orange/blue outputs to
          green/white inputs. Click a cable to remove it. Pause = IC, Halt =
          Hold.
        </p>
      </section>
    </aside>
  )
}

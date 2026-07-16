# RAT 700 Simulator

Browser-based analog computer simulator inspired by the Telefunken RAT 700 (1961). Math-first engine with a schematic patch UI.

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

## Usage

1. Load **Vehicle (firm damp)** or **Harmonic oscillator**.
2. Press **Operate** — for the vehicle preset, watch the car bounce on the scope display.
3. Compare **soft damp** (underdamped / Caprice-style) vs firm.
4. Drag cables from output jacks to inputs; click a cable to remove it.

## Presets

- **Harmonic oscillator** — classic two-integrator sine generator
- **Vehicle suspension** — two-mass car with RG-1-style road noise, plus a full analog X/Y figure generator (sine/cosine oscillator, diode function generator for the body, summers for wheel offsets). The CRT plots those multiplexed voltages with phosphor persistence, like the [Analog Museum demo](https://www.analogmuseum.org/english/examples/vehicle_simulation/).

## Engine

Pure TypeScript under `src/engine/` — summers, integrators, pots, inverters, road signal generator, ±10 V machine unit, RK4 solver, Pot Set / IC / Operate / Hold modes.

## Phase 2 (not in v1)

Diode function generators, multipliers, museum-faithful faceplate UI.

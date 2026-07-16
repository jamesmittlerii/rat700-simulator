# RAT 700 Simulator (v2)

Browser-based, high-fidelity simulator of the Telefunken RAT 700 analog computer. Authentic **30×15** Programmierfeld faceplate (SVG), coefficient pot field, control panel with null-balance galvanometer, and a pure TypeScript RK4 engine.

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

1. Open the **Front panel** tab (default).
2. Load **Harmonic oscillator** or **Vehicle (firm/soft damp)** from the sidebar.
3. Press **Dauerrechnen** — watch the XY phosphor scope on the faceplate.
4. Drag patch cords jack→jack; hover a cable and click for delete/recolor.
5. Use the **4-pin Σ/∫** and **2-pin 1/10** tray tools, then click a switchable amp column to place jumpers.
6. **F1 / F2** rows: 21 knobs each (−10…+10) program the piecewise-linear function generators — scroll or drag vertically to set \(f(x)\).
7. **Pot. Einst.**: select a pot channel button, set the master R11 dial, adjust the pot until the galvanometer centers.

Patches save to `localStorage` key `rat700-patch-v2`.

## Presets

- **Harmonic oscillator** — two integrators + inverter + ω² pot; ∫ jumpers pre-placed; Operate draws a clean orbit.
- **Vehicle suspension** — dual-mass quarter-car with road noise and analog figure generator (firm vs soft Caprice-style damp).

## Engine (`src/engine/`)

UI-free TypeScript: summers, integrators (with jumper time factors), pots, inverters, parabolic multipliers, function generators, road signal, ±10 V machine unit, overload at ±10.5 V, fixed-step RK4 with oversampling, topological algebraic solve, algebraic-loop warnings.

## Architecture

- **Faceplate:** [`src/ui/FrontPanel.tsx`](src/ui/FrontPanel.tsx) + [`src/ui/patchLayout.ts`](src/ui/patchLayout.ts) / [`jackMap.ts`](src/ui/jackMap.ts)
- **Schematic:** secondary debug view
- **Scope:** Canvas 2D phosphor XY ([`XYScope.tsx`](src/ui/XYScope.tsx))

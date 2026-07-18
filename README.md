# RAT 700 Simulator (v2)

Browser-based, high-fidelity simulator of the Telefunken RAT 700 analog computer. Authentic **30×15** Programmierfeld faceplate (SVG), coefficient pot field, control panel with null-balance galvanometer, and a pure TypeScript RK4 engine.

## Live site

GitHub Pages directory + simulator:

- **Directory:** [jamesmittlerii.github.io/rat700-simulator](https://jamesmittlerii.github.io/rat700-simulator/)
- **Simulator:** […/simulator/](https://jamesmittlerii.github.io/rat700-simulator/simulator/)

## Run

```bash
npm install
npm run dev
```

Dev server opens the GitHub Pages directory landing; use **Open RAT 700 simulator** (or visit `/simulator/`) for the faceplate app.

## Test

```bash
npm test
```

## Usage

1. From the directory landing, open the **simulator** (or go straight to `/simulator/`).
2. Open the **Front panel** tab (default).
3. Load **Harmonic oscillator** or **Vehicle (firm/soft damp)** from the sidebar.
4. Press **Dauerrechnen** — watch the XY phosphor scope on the faceplate.
5. Drag patch cords jack→jack; hover a cable and click for delete/recolor.
6. Use the **4-pin Σ/∫** and **2-pin 1/10** tray tools, then click a switchable amp column to place jumpers.
7. **F1 / F2** rows: 21 knobs each (−10…+10) program the piecewise-linear function generators — scroll or drag vertically to set \(f(x)\).
8. **Pot. Einst.**: select a pot channel button, set the master R11 dial, adjust the pot until the galvanometer centers.

Patches save to `localStorage` key `rat700-patch-v2`.

## Presets

- **Harmonic oscillator** — two integrators + inverter + ω² pot; ∫ jumpers pre-placed; Operate draws a clean orbit.
- **Vehicle suspension** — dual-mass quarter-car with road noise and analog figure generator (firm vs soft Caprice-style damp).
- **Lorenz attractor** — the classic chaotic butterfly (σ=10, ρ=28, β=8/3) with three integrators and two quarter-square multipliers, amplitude-scaled onto the ±10 V machine unit; the scope shows the x–z projection.
- **Rössler attractor** — the "folded ribbon" chaos (a=b=0.2, c=5.7) with a single x·z multiplier; scope shows the x–y spiral.
- **Van der Pol** — non-linear damping (μ=2) that converges to a limit cycle; scope shows the x–ẋ phase portrait.
- **Mathieu equation** — parametric pendulum ẍ + [a − 2q·cos 2t]x = 0 in a stable band; scope traces bounded precessing rings (x vs ẋ).
- **Duffing oscillator** — forced double-well beam (β=−1, α=1, δ=0.25, γ=0.4, ω=1) that snaps between wells; scope shows the x–ẋ portrait.
- **Soft-spring 3-body** — restricted soft triangle: two free masses + fixed third at the origin; linear A–B / A–C / B–C springs with cubic softening on A; scope shows body A's drifting x–y flower.

## Engine (`src/engine/`)

UI-free TypeScript: summers, integrators (with jumper time factors), pots, inverters, parabolic multipliers, function generators, road signal, ±10 V machine unit, overload at ±10.5 V, fixed-step RK4 with oversampling, topological algebraic solve, algebraic-loop warnings.

## Architecture

- **Faceplate:** [`src/ui/FrontPanel.tsx`](src/ui/FrontPanel.tsx) + [`src/ui/patchLayout.ts`](src/ui/patchLayout.ts) / [`jackMap.ts`](src/ui/jackMap.ts)
- **Schematic:** secondary debug view
- **Scope:** Canvas 2D phosphor XY ([`XYScope.tsx`](src/ui/XYScope.tsx))

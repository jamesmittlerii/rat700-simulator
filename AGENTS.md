# RAT 700 Simulator

Browser-based Telefunken RAT 700 analog computer simulator (v2 museum faceplate). Client-side React 19 + Vite + TypeScript SPA. No backend; patches persist to `localStorage` (`rat700-patch-v2`).

## Cursor Cloud specific instructions

- Single service. Scripts: `npm run dev` (Vite on 5173), `npm test` (Vitest), `npm run lint` (oxlint), `npm run build` (`tsc -b && vite build`).
- Engine under `src/engine/` is pure TS (no React). Vitest uses `environment: 'node'`.
- Manual check: `npm run dev` → open **simulator** from the directory landing (or `/simulator/`) → Front panel → load Harmonic oscillator → **Dauerrechnen** → XY orbit on the faceplate scope.
- GitHub Pages is a dual entry: root `index.html` is the directory landing; the React app lives under `simulator/`.
- No `.env`, secrets, or auth required.

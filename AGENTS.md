# RAT 700 Simulator

Browser-based analog computer simulator (Telefunken RAT 700, 1961). Client-side React + Vite + TypeScript SPA. No backend, database, or external services; patches persist to browser `localStorage`.

## Cursor Cloud specific instructions

- Single service. All standard commands are in `package.json` scripts: `npm run dev` (Vite dev server on port 5173), `npm test` (Vitest, one-shot), `npm run lint` (oxlint), `npm run build` (`tsc -b && vite build`).
- Tests run in Node (`environment: 'node'` in `vite.config.ts`) — the engine under `src/engine/` is pure TS, so no browser is needed for automated tests.
- For manual/E2E testing, run `npm run dev` and open `http://localhost:5173`, load a preset (e.g. Harmonic oscillator or Vehicle), then click **Operate** to see the X/Y scope animate.
- No `.env`, secrets, or auth required.

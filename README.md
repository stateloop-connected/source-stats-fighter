# Alpha Wars ’89 — MVP

A browser game about planetary defence that is secretly about graphical multiple testing procedures. This is the first playable version: setup, simulation and battle on one configurable scenario.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests (Vitest)
npm run build    # static site in dist/
```

## Layout

- `src/engine/` — the statistical engine, plain TypeScript with no DOM access
  - `normal.ts` normal distribution, critical values, Cholesky, binomial tail
  - `graph.ts` Bonferroni-based graphical procedure (Bretz et al. 2009) and design validation
  - `model.ts` scenario and design types, default scenario, compilation to arrays
  - `battle.ts` one formation, a battle, and Monte Carlo simulation
  - `export.ts` JSON, R (gMCP / graphicalMCP) and TikZ export
  - `engine.test.ts` tests: worked examples, Holm agreement, closed-testing agreement on random graphs, closed-form power, FWER ≤ α under the global null, correlation 0.5 with shared Ground Control
- `src/ui/` — Setup (SVG network editor), Simulation (Web Worker), Battle (Canvas), How to play

## Deployment

`.github/workflows/deploy.yml` tests, builds and publishes `dist/` to GitHub Pages on every push to `main`. In the repository settings, set Pages → Source to "GitHub Actions". The Vite `base` is relative, so the site works at any `https://<account>.github.io/<repository>/` address.

# Alpha Wars ’89 — version 0.3

A browser game about planetary defence that is secretly about graphical multiple testing procedures. Version 0.3 adds a campaign of authored missions on top of the free-training workbench of 0.2, following `../Campaign Version Plan.md`. All seven build steps are in: mission data and rules, the campaign shell, missions 1–8 with balance checks, the board of inquiry with rank and service record, simulator rationing and variation between runs, and artwork in `public/art/`.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests and mission balance checks (Vitest)
npm run build    # static site in dist/
```

## Layout

- `src/engine/` — the statistical engine, plain TypeScript with no DOM access
  - `normal.ts` normal distribution, critical values, Cholesky, binomial tail
  - `graph.ts` Bonferroni-based graphical procedure (Bretz et al. 2009) and design validation
  - `model.ts` scenario and design types, default scenario, compilation to arrays
  - `battle.ts` one formation (impact split into cannon and tracking parts), the lane counting rule, a battle, Monte Carlo simulation
  - `briefing.ts` the briefing in standard sentences
  - `geometry.ts` layout of the network editor, shared with the TikZ export
  - `migrate.ts` versioned saved state and files: checks and upgrades
  - `export.ts` JSON, R (gMCP / graphicalMCP) and TikZ export
  - `missions.ts` missions as data: scenario, rules (which controls are open, simulator allowance), story text, hints, the rival's reference design, variants of the truth between runs, stakes, picture names; characters
  - `campaign.ts` a campaign run: current mission, phase, record of battles fought with the board's verdicts, simulator use, the variant a run faces, the starting design of each mission
  - `inquiry.ts` the board of inquiry: verdicts, merit, ranks
  - `missions.test.ts` balance checks: each mission's lesson holds in numbers
  - `engine.test.ts` tests: worked examples, Holm and closed-testing agreement, closed-form power, FWER ≤ α under the global null, correlation 0.5 with shared Ground Control, lane counting, impact parts, file upgrades, briefing
- `src/ui/` — screens
  - `state.ts` saved state (data version 3): two workspaces, free training and the current mission, plus the campaign
  - `campaign.ts` start screen, mission briefing, service record; `hints.ts` the chief scientist's hints
  - `art.ts` picture slots: `public/art/<name>.png` enlarged by whole factors without smoothing, with drawn fallbacks when a file is missing
  - `panel.ts` panels that redraw only when their data changes and keep keyboard focus
  - `setup.ts`, `network.ts` Setup screen and SVG network editor
  - `simulation.ts`, `sim.worker.ts` Simulation screen and its Web Worker
  - `battle.ts` Battle screen controller; `timeline.ts` (tested, no drawing), `battlefield.ts` and `stats.ts` draw on canvas

## Deployment

The project is kept local for now. `.github/workflows/deploy.yml` is ready for later: it tests, builds and publishes `dist/` to GitHub Pages on every push to `main` once the repository is on GitHub with Pages → Source set to "GitHub Actions". The Vite `base` is relative, so the site works at any `https://<account>.github.io/<repository>/` address.

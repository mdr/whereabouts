# Hunch Map

Single-player prototype of a geography game where you answer by **painting a
probability distribution** on a world map instead of dropping a pin.

## Run

```sh
nix develop        # or let direnv load the shell
pnpm install
pnpm dev           # http://localhost:5173
```

Other commands: `pnpm test` (scoring and paint unit tests), `pnpm typecheck`,
`pnpm build`, `pnpm smoke` (drives the dev server in the installed Chrome via
Playwright, paints a stroke, submits, and saves screenshots to `./smoke-out`).

## How it works

- **Questions** live in `public/questions.json`: a prompt or a Wikimedia Commons
  photo, the answer coordinates, and a per-question tolerance in km.
- **Paint** is stored on sparse H3 hexagons (`src/paint.ts`). The resolution is
  chosen per question so a cell edge is at most a quarter of the tolerance.
  Cells are near-equal-area, so paint intensity is a density.
- **World floor** spreads a chosen share of the mass evenly over the whole
  planet. Its kernel integrals have a closed form, so it costs no cells.
- **Scoring** (`src/scoring.ts`) is the Gaussian-kernel proper scoring rule
  from the design note: `score = 500 (1 + 2A - B)` with
  `k(a,b) = 2^-(d/r)^2` and `d` the chord distance on the Earth sphere.
  `B` is summed only over pairs within four kernel widths, using a 3D grid hash.
- **Colour theme**: "dark ops", a near-black ocean and slate land with paint
  glowing from teal to white and an amber answer marker. The theme recolours
  the basemap layers in place; two playtested alternatives (viridis, paper
  map) remain in `src/themes.ts` for reference.
- **Kernel options** (Playtest section of the panel): the single Gaussian from
  the design note, or a mixture of Gaussians at `r`, `4r` and `16r` with equal
  or 0.5/0.3/0.2 weights. A positive mixture of Gaussians is still a valid
  kernel, so the rule stays proper and bounded. Coarse components aggregate the
  paint onto a grid an eighth of their width before the pair sum. The live
  cheat card and the reveal show the score under every kernel side by side.
- **Reveal** shows the answer, rings at one and two tolerances, the score with
  `A` and `B`, and a live "score if the answer were here" readout on hover.

## Controls

| Action | Control |
| --- | --- |
| Pan / Paint / Erase | `1` / `2` / `3`, or the buttons |
| Pan while painting | hold `Space` |
| Brush size | slider, or `[` and `]` |
| Zoom | scroll wheel |
| Submit / next | `Enter` |

The solid cursor ring is the brush; the dashed blue ring is one tolerance.
The brush turns red when it is capped (about 5,000 cells per stamp).
Place names, country borders, man-made detail (roads, railways, buildings,
airports, urban land use), and inland water (rivers, lakes) are all off by
default; toggle them under **Difficulty**. Coastlines, woodland and ice stay
visible.

# Whereabouts

Single-player prototype of a geography game where you answer by **painting a
probability distribution** on a world map instead of dropping a pin.

## Run

```sh
nix develop        # or let direnv load the shell
pnpm install
pnpm dev           # client on http://localhost:5173, game server on :8787
```

Open two browser tabs at http://localhost:5173 to play against yourself:
host a game in one, join with the code in the other. Tabs are separate
players because the reconnect token lives in session storage.

Other commands: `pnpm test` (unit tests for scoring, paint and the game state
machine, plus end-to-end server tests over real WebSockets), `pnpm typecheck`,
`pnpm build`, `pnpm smoke` (Playwright drives the single-player mode in your
installed Chrome), and from `packages/client`,
`node scripts/multiplayer-smoke.mjs` (two players through a full online round
against the running dev servers).

Server environment overrides for playtesting: `ROUNDS`, `ROUND_MS`,
`REVEAL_MS`, `KERNEL` (a kernel id from `packages/shared/src/scoring.ts`),
`PORT`, `STATIC_DIR`.

## Layout

pnpm workspace with three packages:

- `packages/shared`: geo, scoring, H3 paint model, question pool, the wire
  protocol (zod schemas + view types), and the pure `Game` state machine. No
  I/O anywhere; the same code runs in the browser and on the server.
- `packages/client`: Vite + Preact. Screens: home, solo practice (with the
  playtest tools), and the online game (lobby, timed guessing, reveal,
  results). `PaintController` wraps the MapLibre map and brush input.
- `packages/server`: Fastify for HTTP (health, static client in production)
  and Rivalis for rooms over WebSockets. `GameRoom` adapts one Rivalis room to
  one `Game`; `GameAuth` turns join tickets into room routing. The Rivalis
  WebSocket transport is vendored under `src/vendor` to avoid the native
  WebRTC dependency of `@rivalis/node`.

## Online play

- The host creates a game and gets a four-letter code; others join with it.
- Rounds are 60 seconds. Whatever is painted at the deadline is the guess;
  "Lock in" freezes it early. Blank guesses score the 500 baseline.
- Paint is private until the deadline. The reveal shows the answer, every
  player's score, and lets you click a player to see their paint in their
  colour. Standings carry rank-change arrows.
- Late joiners spectate the current round and play from the next. A dropped
  player keeps their seat and score and reclaims it on reconnect. If the host
  drops, the longest-standing player inherits the host controls.
- State is in memory on a single server process; a restart ends games in
  progress.

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

| Action              | Control                         |
| ------------------- | ------------------------------- |
| Pan / Paint / Erase | `1` / `2` / `3`, or the buttons |
| Pan while painting  | hold `Space`                    |
| Brush size          | slider, or `[` and `]`          |
| Zoom                | scroll wheel                    |
| Submit / next       | `Enter`                         |

The solid cursor ring is the brush; the dashed blue ring is one tolerance.
The brush turns red when it is capped (about 5,000 cells per stamp).
Place names, country borders, man-made detail (roads, railways, buildings,
airports, urban land use), and inland water (rivers, lakes) are all off by
default; toggle them under **Difficulty**. Coastlines, woodland and ice stay
visible.

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

Other commands:

- `pnpm check`: typecheck, ESLint (type-aware), Prettier check and all tests.
  CI runs exactly this plus the client build, inside the same Nix shell.
- `pnpm test`: unit tests for scoring, paint, the game state machine, the
  protocol codec, server config and client components, plus end-to-end
  server tests that drive the real server over WebSockets with the browser
  client.
- `pnpm lint:fix` and `pnpm format` to tidy up.
- Browser smoke scripts (Playwright driving your installed Chrome against
  the running dev servers): `pnpm smoke` for solo mode, and from
  `packages/client`, `node scripts/multiplayer-smoke.mjs` for a two-player
  round and `node scripts/flows-smoke.mjs` for refresh mid-round, late
  joiners and play-again (run the server with
  `ROUND_MS=12000 ROUNDS=2` for those).

Server environment overrides for playtesting: `ROUNDS`, `ROUND_MS`,
`KERNEL` (a kernel id from `packages/shared/src/scoring.ts`),
`PORT`, `STATIC_DIR`.

## Layout

pnpm workspace with three packages:

- `packages/shared`: geo, scoring, H3 paint model, question pool, the wire
  protocol (zod schemas + view types), and the pure `Game` state machine. No
  I/O anywhere; the same code runs in the browser and on the server.
- `packages/client`: Vite + Preact. Screens: home, solo practice, and the
  online game (lobby, timed guessing, reveal, results). The map fills the
  screen with HUD cards over it; `PaintController` wraps the MapLibre map and
  brush input. Add `?dev` to the URL for the developer drawer.
- `packages/server`: Fastify for HTTP (health, static client in production)
  and Rivalis for rooms over WebSockets. `GameRoom` adapts one Rivalis room to
  one `Game`; `GameAuth` turns join tickets into room routing. The Rivalis
  WebSocket transport is vendored under `src/vendor` to avoid the native
  WebRTC dependency of `@rivalis/node`.

## Online play

- The host creates a game and gets a four-letter code; others join with it.
- Rounds are 60 seconds. Whatever is painted at the deadline is the guess;
  "Lock in" freezes it early, and the round ends as soon as every active
  player has locked in. Blank guesses score the 500 baseline.
- Paint is private until the round ends. The reveal shows the answer, every
  player's score, and lets you click a player to see their paint in their
  colour. Standings carry rank-change arrows. There is no timer on the
  reveal: it advances when everyone has pressed Ready, or when the host
  presses Next.
- Late joiners spectate the current round and play from the next. A dropped
  player keeps their seat, score and current paint, and reclaims them on
  reconnect (a browser refresh is the common case). The host keeps the role
  while away; the longest-standing connected player acts as host meanwhile.
  In the lobby a departing host hands over for good.
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
- **Kernel options** (Cheats card of the developer drawer): the single Gaussian from
  the design note, or a mixture of Gaussians at `r`, `4r` and `16r` with equal
  or 0.5/0.3/0.2 weights. A positive mixture of Gaussians is still a valid
  kernel, so the rule stays proper and bounded. Coarse components aggregate the
  paint onto a grid an eighth of their width before the pair sum. The live
  score card and the reveal show the score under every kernel side by side.
- **Reveal** shows the answer, rings at one and two tolerances, and the score.
  In dev mode it also shows `A` and `B` and a live "score if the answer were
  here" readout on hover.

## Controls

| Action              | Control                         |
| ------------------- | ------------------------------- |
| Pan / Paint / Erase | `1` / `2` / `3`, or the buttons |
| Pan while painting  | hold `Space`                    |
| Brush size          | slider, or `[` and `]`          |
| Zoom                | scroll wheel                    |
| Submit / next       | `Enter`                         |

The dashed amber cursor ring is one tolerance; the solid ring that appears
while you drag is the brush. Place names, country borders, man-made detail
(roads, railways, buildings, airports, urban land use), and inland water
(rivers, lakes) are all hidden. Coastlines, woodland and ice stay visible.

## Developer mode

Add `?dev` to the URL (`http://localhost:5173/?dev#/solo`, or `#/solo?dev`)
for a right-hand drawer with the playtest tools: live score and the true
answer while painting, A and B, the kernel selector and side-by-side kernel
scores, score-if-here on hover, the paint distribution by blob, H3 resolution
and cell count, brush strength and world floor sliders, and connection
diagnostics online. Players never see any of this; strength and floor are
fixed for them.

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
  `node scripts/host-smoke.mjs` covers removing a player, rejoining as a
  new one, ending the game early and the brush footprint.
- `node scripts/prod-smoke.mjs [baseUrl]` from `packages/client` checks a
  production build actually loads the map, against `nix run` locally or the
  live site. It catches bundling problems dev mode hides, such as the
  MapLibre worker URL.

Server environment overrides for playtesting: `ROUNDS`, `ROUND_MS`,
`KERNEL` (a kernel id from `packages/shared/src/scoring.ts`),
`PORT`, `STATIC_DIR`.

## Deploy

The game runs on Fly.io as one always-on machine (`fly.toml`, app
`whereabouts-game`, London). Game state lives in the process, so it never
scales out. The flake builds everything:

- `nix build .#whereabouts`: the client bundle plus the server and its
  production dependencies, in the workspace layout it runs from in dev.
- `nix run`: serves that build locally on `PORT` (default 8787).
- `nix build .#image` (Linux only): the container, as a script that streams
  a docker archive to stdout.

Every push to `main` runs the checks, then the `deploy` job builds the image
with Nix, pushes it to `registry.fly.io/whereabouts-game:<sha>` with skopeo
and runs `fly deploy --image`. It authenticates with the `FLY_API_TOKEN`
repository secret, a deploy token scoped to the app.

First-time setup, once, from the dev shell:

```sh
fly auth login              # interactive, in your browser
scripts/fly-bootstrap.sh    # creates the app and prints a deploy token
```

Store the token in 1Password, then add it to the GitHub repo as the
`FLY_API_TOKEN` Actions secret without it touching the clipboard:

```sh
op --account my.1password.com read "op://Private/Fly whereabouts deploy token/credential" \
  | gh secret set FLY_API_TOKEN -R mdr/whereabouts
```

For local `fly` commands, `scripts/fly.sh` pulls the token from 1Password
for that one command (`deploy/op.env` holds the reference):

```sh
scripts/fly.sh status
scripts/fly.sh logs
scripts/fly.sh deploy --image registry.fly.io/whereabouts-game:<sha>   # roll back or forward
```

Images are x86_64 Linux, so they are built in CI rather than on a Mac.

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
  In the lobby the host picks the number of rounds (1 to 15) and the round
  length (30, 45, 60, 90 or 120 seconds).
- Rounds default to 60 seconds. Whatever is painted at the deadline is the guess;
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
- The host can remove a player from any player list (the lobby, the players
  panel during a round, the reveal scores). Their seat, score and paint go
  and that tab cannot reclaim them; they may rejoin with the code as a new
  player. The host can also end the game early: the running round is scored
  as it stands and everyone goes to the final standings. Both are host-only;
  ending asks for a second click.
- State is in memory on a single server process; a restart ends games in
  progress.

## How it works

- **Questions** live in `public/questions.json`: a prompt or a Wikimedia Commons
  photo, the answer coordinates, and a per-question tolerance in km.
- **Paint** is stored on sparse H3 hexagons (`src/paint.ts`) at mixed
  resolutions. The finest resolution is chosen per question so a cell edge is
  at most a quarter of the tolerance; each brush stroke then uses the coarsest
  resolution that still fits about five cells across the brush, so painting a
  continent at world zoom writes a few hundred large cells rather than tens of
  thousands of tiny ones. Intensity is a density and densities add where
  resolutions overlap. Erasing splits a coarser cell that straddles the brush
  edge into its children first, so only the part under the brush goes.
- **World floor** spreads a chosen share of the mass evenly over the whole
  planet. Its kernel integrals have a closed form, so it costs no cells.
- **Scoring** (`src/scoring.ts`) is the Gaussian-kernel proper scoring rule
  from the design note: `score = 500 (1 + 2A - B)` with
  `k(a,b) = 2^-(d/r)^2` and `d` the chord distance on the Earth sphere.
  Each painted cell is treated as a Gaussian patch with the hexagon's second
  moment rather than a point mass, so a coarse cell scores like the fine cells
  it stands for: the kernel between two Gaussian patches is another Gaussian
  with a wider width and smaller amplitude. For `A`, cells much larger than
  the tolerance and near the answer are split into children first, since a
  narrow kernel can tell a peaked patch from a flat hexagon. `B` keeps the
  patch form; in the regime where a cell is a few times the tolerance it runs
  about 10% high, worth roughly 15 points, the price of not refining pairs.
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
  Country borders and place names are switched on for the reveal and off
  again for the next round, since they are hints while guessing.
  In dev mode it also shows `A` and `B` and a live "score if the answer were
  here" readout on hover.

## Controls

| Action              | Control                                              |
| ------------------- | ---------------------------------------------------- |
| Pan / Paint / Erase | `1` / `2` / `3`, or the buttons                      |
| Pan while painting  | hold `Space`                                         |
| Brush size          | slider, or `[` and `]`                               |
| Undo / redo         | `Ctrl+Z` / `Ctrl+Shift+Z` (⌘ on Mac), or the buttons |
| Zoom                | scroll wheel                                         |
| Submit / next       | `Enter`                                              |

The dashed amber cursor ring is one tolerance. The outline under the pointer
is the brush footprint: the exact hex cells the next stamp will touch, at the
resolution the layer picks for that brush size, so at world zoom you see the
large cells you are about to lay down. It is dotted when erasing. Place names, country borders, man-made detail
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

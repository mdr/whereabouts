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
  CI runs exactly this plus the client build, in a slimmer Nix shell
  (`nix develop .#ci`: node, pnpm and jq) whose paths all come from
  cache.nixos.org; the pnpm store is cached between runs with actions/cache.
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
  `node scripts/touch-smoke.mjs` drives touch input through the DevTools
  protocol: one finger paints, a two-finger pinch leaves no paint.
  `node scripts/phone-smoke.mjs` walks every screen at iPhone size and
  fails if anything forces the layout viewport wider than the screen, or
  if the bottom controls are off screen or covered.
  `node scripts/sound-smoke.mjs` records every sound the page starts
  through a two-player game and practice: the cues, the spray and eraser,
  Clear, Pass, the countdown timing, finishing early, running out of time,
  the final applause and the switch (server with `ROUND_MS=12000 ROUNDS=2`). It cannot say how
  anything sounds.
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

Every push to `main` runs the checks and, alongside them, the `image` job,
which builds the image with Nix and pushes it to
`registry.fly.io/whereabouts-game:<sha>` with skopeo (caching skopeo's
blob info between runs, so layers already in the registry are skipped
rather than uploaded again). Once both pass, the
`deploy` job runs `fly deploy --image`, so a failed check never goes live
(it just leaves an unused image in the registry). It authenticates with the `FLY_API_TOKEN`
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
- `packages/client`: Vite + Preact. Screens: home, solo practice (places, whole countries or flags), and the
  online game (lobby, timed guessing, reveal, results). The map fills the
  screen with HUD cards over it; `PaintController` wraps the MapLibre map and
  brush input. Add `?dev` to the URL for the developer drawer.
- `packages/server`: Fastify for HTTP (health, static client in production)
  and Rivalis for rooms over WebSockets. `GameRoom` adapts one Rivalis room to
  one `Game`; `GameAuth` turns join tickets into room routing. The Rivalis
  WebSocket transport is vendored under `src/vendor` to avoid the native
  WebRTC dependency of `@rivalis/node`.

## Online play

- The front page has a hero picture (AI-generated, served as WebP from
  `packages/client/src/assets`, 800 px for phones), your name, three
  separate panels for hosting, joining with a code and practising solo,
  and a three-step how to play.
- The host creates a game and gets a four-letter code; others join with it,
  up to 16 players (one per player colour: the original eight plus eight
  picked to stay distinct from them on the reveal's terrain) and up to 8
  spectators. Spectators join with "Just watch", or are seated as one when
  every player seat is taken; they see each question and every reveal but
  have no paint, colour or score and are never waited on. A spectator can
  take a free seat at any point before the final results, sitting out the
  round under way and playing from the next, like a late joiner; a player
  can step back to watch only in the lobby, since mid-game they have
  scores. The host may be a spectator. Anyone
  already in the game can always reconnect; once both are full a newcomer is
  told the game is full, and a player the host removes frees their seat and colour.
  In the lobby the host picks the question mix: how many rounds of each kind
  of question, with a − / + per kind, and the rounds are their total (1 to
  15). The kinds are landmarks (photos), place names (cities, capitals and
  small countries), whole countries ("Paint the whole of …") and flags (a
  country's flag in place of its name, painted whole or, for a small country,
  asked as a point; see docs/country-scoring.md). A flag round's reveal
  shows the flag of the country under the pointer (tapped, on a phone), and
  under each player the country most of their paint was in ("Peru 62%",
  green when it is the answer). The default is 2 of each,
  8 rounds. A strip of coloured cells, one per round,
  shows the mix to host and guests; the rounds come in a random order, and no
  country is asked twice. A setup saved before the mix is converted to one.
  The host also picks the round length (30, 45, 60, 90 or 120 seconds, as
  pills) and the map detail while guessing, from
  four picture choices (each a preview of the same frame, made by
  `scripts/map-detail-previews.mjs`): Minimal (coastlines only, the
  default), Water (adds rivers and lakes), Physical (adds relief, natural
  colour, forests and ice) and Political (adds country borders). Place names
  never show while guessing. Practice remembers its own choice, set under
  the Practise button. The browser remembers the setup its host last chose,
  and a game it creates starts from that (settings the game no longer
  offers fall back to the default); joining someone else's game uses and
  saves nothing. Guests see just the decided values as tiles, which
  flash briefly when the host changes one. The lobby also offers Copy link and, where
  the browser supports it, Share, and a Leave button over the banner that
  goes home and gives the seat up at once. A guest just leaves; the host is
  asked first, told who takes over or that the game will close, since
  leaving alone closes it straight away.
- Rounds default to 60 seconds. Whatever is painted at the deadline is the guess;
  "Done" freezes it early, and the round ends as soon as every active
  player is done. With nothing painted the button reads "Pass": it scores a
  fixed 250, the same as a blank at the deadline, and stops the round
  waiting on you. That is half what a uniform wash over the whole world
  earns (about 500), so even the vaguest honest guess beats passing, but
  well above a confident guess in the wrong place (near 0). Once done, the button
  becomes "Keep editing", which takes Done back while the round is still
  running.
- Sounds, behind one per-device switch that starts on (a speaker button in
  the top bar, and "Sounds" in the lobby's This device section). While a
  stroke is held: a spray for Paint and a rubber eraser for Erase, each
  random slices of a real recording crossfaded so a long stroke never
  repeats the same stretch twice running (panning is silent). A whoosh for
  Clear when there was paint to wipe, and a chicken for Pass. In online
  rounds, a ticking countdown over the last ten seconds, soft at first,
  timed to the deadline so its alarm lands on zero; two soft marimba notes
  rising as each round starts and falling when everyone finishes early
  (which stops the countdown before its alarm); applause for everyone at
  the final results. The recordings are CC0 from Freesound, cut and
  volume-matched into `packages/client/src/assets/sounds` (the sources are
  listed at the top of `packages/client/src/sound.ts`); the marimba is
  synthesised. Audio starts on the first tap or key press, as browsers
  require, and on iPhone and iPad the silent switch mutes it.
- Paint is private until the round ends. The reveal shows the answer, every
  player's score, and lets you click a player to see their paint in their
  colour, or hide everyone's paint to see just the map and the answer. Rows
  are in this round's score order, winner first, with passes tagged and
  sat-out rows at the bottom; your own row is tinted. The round score is the headline on
  each row; the running total sits beside it, small, until the final
  standings, and the arrows show rank changes. There is no timer on the
  reveal: it advances when everyone has pressed Ready, or when the host
  presses Next.
- Late joiners spectate the current round and play from the next. A dropped
  player keeps their seat, score and current paint, and reclaims them on
  reconnect (a browser refresh is the common case). In the lobby the seat is
  held for 30 seconds (`SEAT_GRACE_MS`), then freed; mid-game it is held for
  good. The host keeps the role while away; the longest-standing connected
  player acts as host meanwhile. An empty game stays open for the same 30
  seconds, so a host alone in the lobby can refresh without losing it.
- The host (or acting host) can hand the role over with the crown button on
  another online player's row, in the lobby or the players panel during a
  round. It is for good: the old host carries on as a player.
- The host can remove a player from any player list (the lobby, the players
  panel during a round, the reveal scores). Their seat, score and paint go
  and that tab cannot reclaim them; they may rejoin with the code as a new
  player. The host can also end the game early: the running round is scored
  as it stands and everyone goes to the final standings. Both are host-only
  and ask for confirmation in a dialog first.
- State is in memory on a single server process; a restart ends games in
  progress.

## How it works

- **Questions** live in `packages/shared/questions.json`: a prompt or a
  Wikimedia Commons photo, the answer coordinates, and a per-question
  tolerance in km. Two kinds: `photo` ("Where is this?" plus a picture) and
  `text` ("Where is Nauru?"). The text set is capital cities, major world
  and UK cities, and small countries, with tolerances calibrated for a UK
  player: tens of km for the British Isles and near neighbours, around
  100 km for European cities and micro-states, 200 km for the most famous
  cities elsewhere (New York, Tokyo, Sydney), a few hundred for other
  cities and small countries further afield, up to 1,000 km for Pacific
  micro-states. A name shared by two well-known places carries its country
  in the prompt ("Where is Tripoli, Libya?"). A country question is placed at the point Wikipedia uses
  for the country itself (roughly its centre, or the main island of an
  archipelago), not at its capital. Every text answer was checked against
  the coordinates on its English Wikipedia article, and `questions.test.ts` guards ids,
  ranges and near-duplicate spots. Photo questions are famous landmarks,
  natural and built; each image is the lead picture of the landmark's
  Wikipedia article, checked to exist on Commons at 800px or more and
  looked at when the file name gave any doubt. Several landmarks may share
  a city (the photo is the clue). Each question also names its English
  Wikipedia article (`wiki`), linked from the reveal so players can read
  about the place; the titles were matched by name and checked against
  the article's coordinates, and a question without one links to a
  Wikipedia search for its label instead. A game draws the host's share of photo
  and text questions, topping up from the other kind if one runs short
  (`pickQuestions`), in a shuffled order, preferring questions at least
  50 km apart. The question photo
  enlarges on click; the enlarged view zooms with the wheel or a pinch and
  pans by dragging.
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
  Games and practice both use a mixture of that Gaussian at `r`, `4r` and
  `16r` with equal weights (`DEFAULT_KERNEL`), so a confident guess a few
  tolerances off still earns partial credit (818 at one tolerance, 631 at
  two, 486 at four, against 500, 63 and 0 for the single Gaussian).
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
- **Kernel options** (Cheats card of the developer drawer): practice can
  switch from the game's kernel to the single Gaussian of the design note or
  the 0.5/0.3/0.2 mixture, for comparison. A positive mixture of Gaussians is still a valid
  kernel, so the rule stays proper and bounded. Coarse components aggregate the
  paint onto a grid an eighth of their width before the pair sum. The live
  score card and the reveal show the score under every kernel side by side.
- **Reveal** shows the answer as a single dot, and the score.
  Country borders and place names are switched on for the reveal and off
  again for the next round, since they are hints while guessing.
  In dev mode it also shows `A` and `B` and a live "score if the answer were
  here" readout on hover.
- **Whole countries** (design notes and the decisions behind the scoring: [docs/country-scoring.md](docs/country-scoring.md)): in practice, the Practise panel on the front page
  chooses Places or Whole countries; in a game, the host's Whole countries
  setting mixes them in. The server holds `regions.json` and scores country
  rounds with `scoreRegionQuestion` (16 players in 170 to 270 ms); a round
  tells clients only the country's id, and a client fetches the outlines
  when a game with countries starts, to draw the country at the reveal,
  where each player's score card also says how much of the country they
  covered and how much of their paint was on it. A country question ("Paint
  the whole of Germany") has an area as its answer, not a point: 37
  countries from Natural Earth's 1:50m outlines (public domain), built into
  `packages/shared/regions.json` by `scripts/build-regions.mjs`, which keeps
  each country's main landmass and the islands of 1,500 km² or more within
  500 km of it (so Sicily stays; the Canaries, Svalbard and Alaska go),
  simplifies the outlines to about 1.5 km and sets the tolerance to a fifth
  of the country's equivalent radius, sqrt(area / π). Countries with
  disputed borders, or crossing the antimeridian, are left out for now.
  The outlines load only when practice asks for countries (their own
  ~70 KB gzipped chunk). Scoring (`scoreRegionQuestion`) is
  `max(shape, 0.55 x nearness)`:
  - **shape** compares the paint with the country cell by cell at the
    painting resolution, `1000 - 500 sum (p - q)^2 / a / sum q^2 / a` with p
    and q the paint's and the country's mass in each cell of area a. It is
    the kernel score in the limit of a vanishing kernel width, and proper.
    Putting a share P of the paint evenly on the country (the rest just
    outside) scores `500 + 500 P`; covering a fraction c of it evenly scores
    `1000 - 500 (1/c - 1)`; half on the country and half elsewhere scores
    750, like a 50/50 point answer; uneven brushing (a bright middle fading
    to half density at the edges) costs about 50. Before scoring, each
    cell's paint density is capped at 1.5 times the median painted density
    (`capDensity`): strokes overlap, and a second pass down the middle of
    Mexico, doubling the density there, cost an otherwise near-perfect paint
    about 90 points (892 in play). A country is uniform, so painting part of
    it again says nothing; lighter paint, a hedge on a second guess, stays
    under the cap. Simulated brushed paints of Mexico with a second pass now
    score 939 to 952, against 961 for one even coat. Paint off the country
    counts as no thinner than half the country's own even coat
    (`OFF_COUNTRY_FLOOR`): otherwise wrong paint spread thinly earned the
    credit the score gives vagueness, and a big faint blob in North America
    scored 444 for Madagascar. It now scores about 274, and the whole world
    painted evenly about 297, just above a pass; bloating the border, 50/50
    hedges and confident misses are unaffected.
  - **nearness** is the kernel score (`scoreRegion`) under one Gaussian 16
    tolerances wide, run one H3 resolution coarser than painting. A paint
    that misses the country has a shape score near 0 whether it is next door
    or on another continent; nearness is what puts a neighbour above a far
    country. A paint on the right country gets at least 0.55 of its
    nearness, about 545.

  `scoreRegion` is the point rule with the country as the answer:
  `1000 - 500 (B - 2A + Q) / Q` with `A = <p,q>`, `Q = <q,q>`, for each
  Gaussian component on its own and then weighted, scores below 0 clamped. A
  point is the case `Q = 1`; dividing by `Q` keeps a large country on the
  same scale (an even paint of the whole world scores about 500), and each
  component needs its own `Q`, or a wide one, which sees the country as a
  compact blob with `Q` near 1, swamps the rest.

  How it got here, from playtest feedback and calibration against synthetic
  paints (partial, bloated, shifted, hedged, uneven) and real wrong
  countries: a mixture of Gaussians about the tolerance wide forgave leaving
  part of a country out (65% of Australia scored 879), and blurred the
  country's edge so that paint spilling well outside it was nearly free
  (South Africa with half the paint off it scored 883); a single narrow
  Gaussian ranked Poland (11) below Japan (159) as an answer for Germany; a
  coverage factor fixed the first but not the second. Taking the maximum of
  two proper scores is not proper, but it only lifts misses, towards their
  nearness. Now 80% of a country scores about 885, 65% about 757, half about
  550, and South Africa bloated to about half on it 741; against Germany,
  painting Germany scores 999, Poland 435, France 402 and Japan 76. The
  reveal outlines the country and frames it with the paint, and shows how
  much of the country was covered and how much of the paint was on it
  (explanation only; neither feeds the score).

## Controls

| Action              | Control                                                       |
| ------------------- | ------------------------------------------------------------- |
| Pan / Paint / Erase | `1` / `2` / `3`, or the buttons                               |
| Fill                | `4`, or the button (a country round on the Political map)     |
| Pan while painting  | hold `Space`, or drag with the middle button                  |
| Brush size          | slider, or `[` and `]`                                        |
| Undo / redo         | `Ctrl+Z` / `Ctrl+Shift+Z` (⌘ on Mac), or the buttons          |
| Trim sea            | the Trim sea button: removes paint more than ~20 km from land |
| Zoom                | scroll wheel                                                  |
| Submit / next       | `Enter` (practice)                                            |
| List these keys     | `?`, or the keyboard button in the toolbar                    |

Trim sea uses a land mask (`packages/shared/land.json`, built by
`scripts/build-land.mjs` from Natural Earth's 1:10m land and minor islands):
the H3 cells about 17 km across that touch land, about 110 KB gzipped,
fetched on the first press. Most sea paint within 10 km of land stays,
and none beyond about 20 km does. It is one undoable step and says
how much it removed. It is the player's choice, not a free gain: a blob
centred on a coastal answer loses its sea side and can score lower (up to
about 85 points in testing), while island answers often gain.

Fill appears in a round that asks for a country (whole countries and flags)
when the map detail is Political. A click (a tap, on a phone) fills the
country under it with an even coat; fill several if unsure, each weighted by
its area, and click a filled one to take it off. The outline under the
pointer is the country a click would fill, dotted when it would unfill, and
the map still drags. A country scored as a shape is filled with the outline
it is scored by, so filling the right one scores 970 to 999; any other is
filled with its land from `borders.json`, and a flag round asked as a point
scores like an even coat of the country (Russia about 880, Malta about 980).
See `packages/shared/src/fill.ts`.

The outline under the pointer is the brush footprint: the exact hex cells the next stamp will touch, at the
resolution the layer picks for that brush size, so at world zoom you see the
large cells you are about to lay down. It is dotted when erasing.
On a touchscreen one finger uses the current tool (so it paints, or pans
with the Pan tool) and two fingers always pan and zoom; a pinch that
started as a stray one-finger dab takes that paint back. Below 640px wide
(phones) the HUD becomes one column: cards at the top, the toolbar across
the bottom with icon-only tool buttons, and the map in between; the zoom
buttons go (pinch instead) and the attribution button sits above the
toolbar. While guessing, place names and man-made detail (roads, railways,
buildings, airports, urban land use) are always hidden; how much else shows
depends on the game's map detail, and on Minimal only coastlines do. The reveal turns everything but roads back
on and adds shaded relief from the public AWS terrain tiles (Terrarium
encoding, no key). The relief sits under the water layer, since the tiles
carry ocean depths too, and on Minimal and Water no terrain tiles are fetched
while guessing (the multiplayer smoke checks this). Under the relief goes natural colour
(green lowlands, desert sand, white ice) from the Natural Earth II tiles the
positron style already declares on OpenFreeMap. They stop at zoom 6 and are
stretched beyond it, which the relief on top hides. Dimmed to suit the dark
theme, and likewise hidden while guessing below Physical. A lobby checkbox, remembered per device, starts each round on the Pan
tool instead of Paint.

## Developer mode

Add `?dev` to the URL (`http://localhost:5173/?dev#/solo`, or `#/solo?dev`)
for a right-hand drawer with the playtest tools: live score and the true
answer while painting (for a country: its shape and nearness scores and how
much of the paint is on and off it), A and B, the kernel selector and
side-by-side kernel scores, score-if-here on hover, the paint distribution by blob, H3 resolution
and cell count, brush strength and world floor sliders, and connection
diagnostics online. Players never see any of this; strength and floor are
fixed for them.

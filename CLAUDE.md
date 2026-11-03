## Code comments

- Add a comment only when the reason for the code isn't obvious from the code itself. Most code needs none.
- When a comment is needed, write only what a future reader needs: the non-obvious reason or constraint, in as few words as possible.
- Leave out incidental detail, background the reader doesn't need, restating what the code does, and the history of how we got here (what was tried, what changed, what the old behaviour was). That history belongs in the commit message, if anywhere.

## Code

- Write TypeScript, not JavaScript, scripts included (a test fails on a tracked `.js`/`.mjs`/`.cjs` outside `vendor/`). Scripts that import `src/` (it has enums) run with `node --experimental-transform-types`.
- String enums with ALL_CAPS names and values; reference members, not raw strings.
- Except values whose literal types an outside library owns: an `as const` object, so its types apply.
- Discriminators are called `type`. Variants are unions of named types, not a base interface plus intersections.
- Full-word names. `undefined`, not `null`.
- Never derive display text from code names (enum values, keys) by changing case; map each to its text.
- Write the actual type, not an indirection like `GameMap["map"]`, unless it is very complex or inexpressible.
- Annotate functions' return types. Not needed for Preact components, nor where the type is too complex to write (then ask whether the function should be simpler).
- Small modules, one job each; pull pure logic out so it can be unit-tested.

## Logs

- Server logs are flat JSON lines through `logEvent`: a `code` from `LOG_CODES` (constants, not an enum: `LOG_CODES.group.event`, valued `"group.event"`, lowerCamel, grouped by subject), with `kind`/`reason` values in lowerCamel too, a short human `msg`, and camelCase fields with units in their names (`openMs`). Errors go in `err`. Never log paint, guesses or tokens; addresses only where a connection is refused.

- Metrics: `whereabouts_` snake_case names in base units (`_seconds`), `_total` on counters; labels and their values snake_case, from a small fixed set, never IDs, codes or names. Each enum maps to its label in a `Record`.

## Folders

- When several files in a folder share a prefix for one area (`paint-*`, `map-*`), give them a subfolder named after it, whatever the folder's size.
- A folder holds at most 30 entries, about one editor screen; lint enforces it.

## Components

- A `.tsx` file exports one component, with its own CSS module and `*TestIds.ts`. A helper component may stay in the file if it is unexported, used only there, and short (about 30 lines).
- A screen with several sections is a folder named after it, a file per section. Only a family of tiny layout slots (`ui/map/Hud.tsx`) shares a file.

## Tests

- Two levels: unit tests of services and pure functions (quick, run often), and IWFTs of the whole client in a browser (slower, run less). Nothing renders a component on its own: move its logic into the service or a pure function and unit-test that. A behaviour may be tested at both levels.
- Specify only the data the scenario needs; `makeX` factories supply defaults.
- Endpoint behaviour: `*.iwbt.ts` specs against the in-process server, through `TestPlayer`'s steps; only tests about the protocol itself touch `wire`.

## Browser tests

- Page objects offer `expect…` methods; specs never see locators.
- Locate by test ID. Where a test ID alone identifies a state, assert on its presence rather than text or attributes.
- State that ARIA already expresses (`aria-pressed`…): assert the ARIA attribute.
- Page state: web-first assertions (`toHaveText`, `toBeVisible`…). Other state (map, VR, sound): `expect.poll`.
- "Doesn't happen" checks hold over time, after a positive check.
- Tests never assume a fixed port or shared state, so runs in other worktrees can go at the same time.
- Play against the in-process server (the `game` fixture) in `*.iwft.ts` specs; use `*.e2e.ts` (the dev servers) only when the test is about client and server together. Set games up and check them through the fixture (`seat`, `paint`, `advance`, `expectGame`), not extra tabs.

## Product

- Practice and multiplayer behave the same unless there is a reason not to.

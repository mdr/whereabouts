## Code comments

- Add a comment only when the reason for the code isn't obvious from the code itself. Most code needs none.
- When a comment is needed, write only what a future reader needs: the non-obvious reason or constraint, in as few words as possible.
- Leave out incidental detail, background the reader doesn't need, restating what the code does, and the history of how we got here (what was tried, what changed, what the old behaviour was). That history belongs in the commit message, if anywhere.

## Code

- String enums with ALL_CAPS names and values; reference members, not raw strings.
- Except values whose literal types an outside library owns: an `as const` object, so its types apply.
- Discriminators are called `type`. Variants are unions of named types, not a base interface plus intersections.
- Full-word names. `undefined`, not `null`.
- Small modules, one job each; pull pure logic out so it can be unit-tested.

## Folders

- When several files in a folder share a prefix for one area (`paint-*`, `map-*`), give them a subfolder named after it, whatever the folder's size.
- A folder holds at most 30 entries, about one editor screen; lint enforces it.

## Components

- A `.tsx` file exports one component, with its own CSS module and `*TestIds.ts`. A helper component may stay in the file if it is unexported, used only there, and short (about 30 lines).
- A screen with several sections is a folder named after it, a file per section. Only a family of tiny layout slots (`ui/map/Hud.tsx`) shares a file.

## Tests

- Specify only the data the scenario needs; `makeX` factories supply defaults.

## Browser tests

- Page objects offer `expect…` methods; specs never see locators.
- Locate by test ID. Where a test ID alone identifies a state, assert on its presence rather than text or attributes.
- Page state: web-first assertions (`toHaveText`, `toBeVisible`…). Other state (map, VR, sound): `expect.poll`.
- "Doesn't happen" checks hold over time, after a positive check.

## Product

- Practice and multiplayer behave the same unless there is a reason not to.

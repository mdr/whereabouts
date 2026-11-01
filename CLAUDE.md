## Code comments

- Add a comment only when the reason for the code isn't obvious from the code itself. Most code needs none.
- When a comment is needed, write only what a future reader needs: the non-obvious reason or constraint, in as few words as possible.
- Leave out incidental detail, background the reader doesn't need, restating what the code does, and the history of how we got here (what was tried, what changed, what the old behaviour was). That history belongs in the commit message, if anywhere.

## Folders

- When several files in a folder share a prefix for one area (`paint-*`, `map-*`), give them a subfolder named after it, whatever the folder's size.
- A folder holds at most 30 entries, about one editor screen; lint enforces it.

## Components

- A `.tsx` file exports one component, with its own CSS module and `*TestIds.ts`. A helper component may stay in the file if it is unexported, used only there, and short (about 30 lines).
- A screen with several sections is a folder named after it, a file per section. Only a family of tiny layout slots (`ui/map/Hud.tsx`) shares a file.

## Browser tests

- Page objects offer `expect…` methods; specs never see locators.
- Page state: web-first assertions (`toHaveText`, `toBeVisible`…). Other state (map, VR, sound): `expect.poll`.
- "Doesn't happen" checks hold over time, after a positive check.

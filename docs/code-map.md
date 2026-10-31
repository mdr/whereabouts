# Code map

Where things live, and the steps for the changes that touch several of them.

## Shared (`packages/shared`): model, scoring, game logic, protocol

No I/O; the same code runs in the browser and on the server.

| Module                                            | What it holds                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `catalogue.json`, `src/catalogue.ts`              | Every question; `poolOf` draws from it for games, practice and the score review                                                     |
| `outlines.json`                                   | Area answers' geometry, by `OutlineId`                                                                                              |
| `src/questions.ts`                                | The question model: `QuestionType`, clue and answer unions, `QuestionSchema`, prompts                                               |
| `src/ids.ts`, `src/units.ts`                      | Branded ids and strings (`QuestionId`, `WikiTitle`…), unit flavours (`Km`, `Ms`…)                                                   |
| `src/protocol.ts`                                 | Client→server message schemas, `GameConfig`, `GameView` and its parts, `PROTOCOL_VERSION`                                           |
| `src/view-schema.ts`                              | A zod schema of `GameView` for the tests (the client casts)                                                                         |
| `src/game.ts`                                     | The `Game` state machine: joining, rounds, scoring each player, views                                                               |
| `src/paint.ts`, `src/paint-wire.ts`               | The H3 paint layer, and its binary encoding                                                                                         |
| `src/scoring.ts`, `src/regions.ts`                | The point rule, and the area rule (`scoreAnswer` picks)                                                                             |
| `src/hints.ts`, `src/awards.ts`, `src/explain.ts` | Hint bands, end-of-game awards, a score in words                                                                                    |
| `src/facts.ts`, `src/photos.ts`                   | Reveal facts and photos, by Wikipedia title                                                                                         |
| `src/score-review.ts`, `src/scoring-case.ts`      | The playtesters' score review, and copied scoring cases                                                                             |
| `scripts/`                                        | Data builds: `build-regions.mjs` and `build-features.mjs` write their types into the catalogue and outlines (`write-catalogue.mjs`) |

## Server (`packages/server`)

| Module                        | What it holds                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/rooms.ts`                | `GameRoom`: one Rivalis room per `Game`; binds each `ClientMessageSchemas` topic to a handler; `GameAuth` turns tickets into rooms |
| `src/app.ts`, `src/config.ts` | Fastify, static client, environment settings (`ROUND_MS`, `KERNEL`…)                                                               |

## Client (`packages/client`)

| Module                                 | What it holds                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/net.ts`                           | `Connection`: the WebSocket, views as signals, commands, the server clock offset             |
| `src/screens/`                         | One component per screen: Home, Lobby, InGame, Reveal, Results, Solo (practice), ScoreReview |
| `src/ui/`                              | Shared components; each with a `*TestIds.ts` the browser page objects use                    |
| `src/round.ts`, `src/vr-round.ts`      | Pure round logic for the page and for VR, tested apart from the components                   |
| `src/question-types.ts`                | Each question type's label, units and colour                                                 |
| `src/settings.ts`, `src/host-setup.ts` | Browser-stored settings, and the host's saved setup                                          |
| `src/map.ts`, `src/paint-*.ts`         | The MapLibre map and painting on it                                                          |
| `src/vr/`                              | The headset scene (three.js, IWSDK)                                                          |
| `browser/pages/`, `browser/e2e/`       | Playwright page objects, and the end-to-end scripts that use them                            |

## Checklists

**Add a question type**

1. Add it to `QuestionType` and give it a variant in `questions.ts` (interface, `Question` union, `QuestionSchema`).
2. Build or write its questions into `catalogue.json` (a build script uses `writeQuestions`; area answers need their outlines).
3. Give it a look in `client/src/question-types.ts`; the mix editor, practice picker and results read it from there.
4. Check the per-type rules: `EXTRA_TYPES` and `evenMix` in `protocol.ts`, `WITH_REVEAL_PHOTO` in `photos.ts`, the score review's mix in `score-review.ts`, `areaNoun` and the Fill tool in `client/src/round.ts`.
5. Bump `PROTOCOL_VERSION`: a game's mix gains a key.

**Add a client→server message or a view field**

1. A message: its schema in `ClientMessageSchemas`, a handler in `GameRoom.handlers()` (the compiler insists), a `Game` method, a `Connection` method.
2. A view field: the type in `protocol.ts` and the same field in `view-schema.ts`; `view-schema.test.ts` fails until they match.
3. Bump `PROTOCOL_VERSION`.
4. A browser page object, if the e2e scripts should drive or read it.

**Add a game setting**

1. A field in `GameConfig`, `DEFAULT_CONFIG` in `game.ts`, `ConfigureSchema`, and `view-schema.ts`.
2. `Game.configure()` compares settings field by field: add the new one, or a change to it is ignored.
3. The lobby's control and summary (`screens/Lobby.tsx`). The host's saved setup (`host-setup.ts`) takes its fields from `ConfigureSchema`; an old stored form needs mapping there.
4. Bump `PROTOCOL_VERSION`.

**Add a browser setting**

1. `persisted(key, schema, initial)` in `settings.ts` for a string-encoded value, `persistedJson` for JSON.
2. An enum value: wrap the schema in `oldEnumValue` if older builds stored it in another form; any other change of format needs its own migration on read.
</content>

</invoke>

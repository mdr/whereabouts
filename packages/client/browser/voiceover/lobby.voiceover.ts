// A worked example to copy, not part of any suite: drive the app with page objects and the
// game fixture, then listen. `task voiceover -- lobby` runs it.
import { expect } from "@playwright/test"
import { test } from "./voiceover-test.ts"

test("the lobby, as VoiceOver reads it, and whether a player joining is announced", async ({ tab, game, listen }) => {
  const homePage = await tab.openHome()
  await homePage.enterName("Alice")
  const lobbyPage = await homePage.hostGame()

  const screenReader = await listen()
  screenReader.report("the lobby, item by item", await screenReader.readAll())

  const joining = await screenReader.heard(async () => {
    game.seat(["Bob"])
    await lobbyPage.players.waitForPlayer("Bob")
  })
  screenReader.report("while Bob joins", joining)

  const tabbing = await screenReader.command((voiceOver) => voiceOver.press("Tab"))
  expect(tabbing.length, "Tab moves somewhere VoiceOver names").toBeGreaterThan(0)
})

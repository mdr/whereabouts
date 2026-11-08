// A part of a country on the in-process server: the reveal says whose it is.
import { mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { test } from "../game-server/game-server.ts"
import { newTab } from "./iwft-tab.ts"

test.use({
  serverOptions: {
    config: { mix: mixOf({ [QuestionType.PART_OF_COUNTRY]: 1 }), roundLength: 60_000 },
    questions: (question) => question.id === "part-svalbard"
  }
})

test("part of a country", async ({ browser, game }) => {
  const tab = await newTab(browser, "Alice", { game })
  const homePage = await tab.openHome()
  await homePage.enterName("Alice")
  const roundPage = await (await homePage.hostGame()).startGame()
  const revealPage = await roundPage.finishLast()

  await test.step("the reveal says whose it is", async () => {
    await revealPage.expectPartOf("part of Norway")
  })
})

// A flag round's look-alikes on the in-process server: any of the small flags
// opens them all large, in the same order, and leaving goes back to the reveal.
import { mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { test } from "../game-server/game-server.ts"
import { LightboxExit } from "../pages/components/Lightbox.ts"
import { newTab } from "./iwft-tab.ts"

test.use({
  serverOptions: {
    config: { mix: mixOf({ [QuestionType.FLAG]: 1 }), roundLength: 60_000 },
    questions: (question) => question.type === QuestionType.FLAG && question.clue.flag === "id"
  }
})

test("look-alike flags open large together", async ({ browser, game }) => {
  const tab = await newTab(browser, "Alice", { game })
  const homePage = await tab.openHome()
  await homePage.enterName("Alice")
  const roundPage = await (await homePage.hostGame()).startGame()
  const revealPage = await roundPage.finishLast()

  await test.step("a small flag opens them all large, the answer's first", async () => {
    const compare = await revealPage.compareLookalikes(2)
    await compare.expectFlags(["Indonesia", "Monaco", "Poland"])
    await compare.expectFlagsAtLeast(100)
    await compare.exit(LightboxExit.ESCAPE)
  })

  await test.step("Enter while they are open doesn't start the next round", async () => {
    const compare = await revealPage.compareLookalikes()
    await revealPage.pressEnter()
    await compare.expectOpen()
    await revealPage.expectStaysShown()
    await compare.exit(LightboxExit.CLOSE_BUTTON)
  })

  await test.step("the backdrop closes them too", async () => {
    const compare = await revealPage.compareLookalikes()
    await compare.exit(LightboxExit.BACKDROP)
    await revealPage.expectStaysShown()
  })
})

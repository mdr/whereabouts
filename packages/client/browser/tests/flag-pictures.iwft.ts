// Flags on the in-process server: a country round shows its flag beside the
// name and a flag round its own, a place round none; each flag is drawn in
// its own shape, enlarged without a credit while guessing and with one after;
// the reveal says where another player's paint was.
import { mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType, type Question } from "@whereabouts/shared/questions"
import type { LatLon } from "@whereabouts/shared/geo"
import type { Km } from "@whereabouts/shared/units"
import type { InProcessOptions } from "../../../server/src/test-support/in-process-server.ts"
import { test } from "../game-server/game-server.ts"
import { LightboxExit } from "../pages/components/Lightbox.ts"
import { newTab } from "./iwft-tab.ts"

interface FlagCase {
  name: string
  code: string
  /** Width over height. */
  shape: number
  paintAt: LatLon
  radius: Km
}

// Nepal's flag is taller than wide, Qatar's the widest.
const FLAGS: FlagCase[] = [
  { name: "Nepal", code: "np", shape: 0.8203, paintAt: { lat: 28.2, lon: 84.1 }, radius: 60 },
  { name: "Qatar", code: "qa", shape: 2.5455, paintAt: { lat: 25.3, lon: 51.2 }, radius: 20 }
]

const only = (type: QuestionType, matches: (question: Question) => boolean = () => true): InProcessOptions => ({
  config: { mix: mixOf({ [type]: 1 }), roundLength: 60_000 },
  questions: (question: Question) => question.type === type && matches(question)
})

test.describe("the flag by the question", () => {
  test.describe("a country round", () => {
    test.use({
      serverOptions: only(
        QuestionType.COUNTRY,
        (question) => question.type === QuestionType.COUNTRY && !!question.countryFlag
      )
    })
    test("shows the country's flag", async ({ browser, game }) => {
      const tab = await newTab(browser, "Alice", { game })
      const homePage = await tab.openHome()
      await homePage.enterName("Alice")
      const roundPage = await (await homePage.hostGame()).startGame()
      await roundPage.questionCard.flag.expectShown(true)
    })
  })

  test.describe("a place round", () => {
    test.use({ serverOptions: only(QuestionType.PLACE) })
    test("shows none", async ({ browser, game }) => {
      const tab = await newTab(browser, "Alice", { game })
      const homePage = await tab.openHome()
      await homePage.enterName("Alice")
      const roundPage = await (await homePage.hostGame()).startGame()
      await roundPage.questionCard.flag.expectShown(false)
    })
  })
})

for (const { name, code, shape, paintAt, radius } of FLAGS) {
  test.describe(`a flag round, ${name}`, () => {
    test.use({
      serverOptions: only(
        QuestionType.FLAG,
        (question) => question.type === QuestionType.FLAG && question.clue.flag === code
      )
    })

    test("draws the flag in its shape, enlarged and credited only after the round", async ({ browser, game }) => {
      const tab = await newTab(browser, "Alice", { game })
      const homePage = await tab.openHome()
      await homePage.enterName("Alice")
      const lobbyPage = await homePage.hostGame()
      const [bob] = game.seat(["Bob"])
      await lobbyPage.players.waitForPlayer("Bob")
      const roundPage = await lobbyPage.startGame()

      await test.step("the question's flag is in its own shape, and enlarged has no credit link", async () => {
        const { flag } = roundPage.questionCard
        await flag.expectShown(true)
        await flag.expectShape(shape)
        const lightbox = await flag.enlarge()
        await lightbox.expectShape(shape)
        await lightbox.expectCredit(false)
        await lightbox.exit(LightboxExit.ESCAPE)
      })

      const revealPage = await test.step("the reveal says where Bob's paint was", async () => {
        game.paint(bob!, paintAt, radius)
        const done = await roundPage.finish()
        game.lock([bob!])
        const reveal = await done.waitForReveal()
        await reveal.expectPaintedIn("Bob", name, new RegExp(`^\\d+% of Bob's paint was in ${name}, the answer$`))
        return reveal
      })

      await test.step("the results show the flag in its shape, enlarged with a credit link", async () => {
        const results = await revealPage.showFinalResults()
        await results.roundFlag.expectShape(shape)
        const lightbox = await results.roundFlag.enlarge()
        await lightbox.expectShape(shape)
        await lightbox.expectCredit(true)
        await lightbox.expectCreditToCommons()
        await lightbox.exit(LightboxExit.BACKDROP)
      })
    })
  })
}

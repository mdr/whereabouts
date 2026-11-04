// Photo rounds on the in-process server: the "Enlarge" label on the session's
// first photo only, the enlarged photo (leaving it, zooming it, the larger
// rendition arriving), and its credit link, shown only once the round is over.
import { mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { test } from "../game-server/game-server.ts"
import { LightboxExit } from "../pages/components/Lightbox.ts"
import { newTab } from "./iwft-tab.ts"

test.use({
  serverOptions: {
    config: { mix: mixOf({ [QuestionType.LANDMARK]: 2 }), roundLength: 60_000 },
    questions: (question) => question.type === QuestionType.LANDMARK
  }
})

test("photo rounds", async ({ browser, game }) => {
  const tab = await newTab(browser, "Alice", { game })
  const homePage = await tab.openHome()
  await homePage.enterName("Alice")
  const roundPage = await (await homePage.hostGame()).startGame()
  const card = roundPage.questionCard
  // From the start: a larger rendition fetched in an earlier step would be cached, and arrive at once.
  await card.holdLargePhotos()

  await test.step("the first photo of the session says Enlarge", async () => {
    await card.expectEnlargeLabel(true)
  })

  await test.step("there is no credit link while guessing", async () => {
    await card.expectPhotoCredit(false)
    const lightbox = await card.enlargePhoto()
    await lightbox.expectCredit(false)
    await lightbox.exit(LightboxExit.ESCAPE)
  })

  await test.step("the photo is enlarged and left by Escape, the close button or the backdrop", async () => {
    for (const how of [LightboxExit.ESCAPE, LightboxExit.CLOSE_BUTTON, LightboxExit.BACKDROP]) {
      const lightbox = await card.enlargePhoto()
      await lightbox.exit(how)
    }
  })

  await test.step("a click zooms the photo in and out, the wheel zooms within 1x to 6x", async () => {
    const lightbox = await card.enlargePhoto()
    await lightbox.expectScale(1)
    await lightbox.clickPicture()
    await lightbox.expectScale(2.5)
    // Clicking the picture does not close it.
    await lightbox.expectOpen()
    await lightbox.clickPicture()
    await lightbox.expectAtFit()
    await lightbox.wheel(-500)
    await lightbox.expectZoomedIn()
    await lightbox.wheel(-50_000)
    await lightbox.expectScale(6)
    await lightbox.wheel(50_000)
    await lightbox.expectAtFit()
    await lightbox.exit(LightboxExit.ESCAPE)
  })

  await test.step("the larger rendition replaces the thumbnail's, keeping the zoom", async () => {
    const lightbox = await card.enlargePhoto()
    await lightbox.expectPhotoWidth(900)
    await lightbox.clickPicture()
    await lightbox.expectScale(2.5)
    await card.releaseLargePhotos()
    await lightbox.expectPhotoWidth(1600)
    await lightbox.expectScale(2.5)
    await lightbox.exit(LightboxExit.ESCAPE)
  })

  const revealPage = await roundPage.finishLast()

  await test.step("on the reveal the photo is credited, and links to Commons", async () => {
    await revealPage.questionCard.expectPhotoCredit(true)
    await revealPage.questionCard.expectPhotoCreditToCommons()
    const lightbox = await revealPage.questionCard.enlargePhoto()
    await lightbox.expectCredit(true)
    await lightbox.expectCreditToCommons()
    await lightbox.exit(LightboxExit.CLOSE_BUTTON)
  })

  await test.step("the second photo is just an icon", async () => {
    const secondRound = await revealPage.nextRound()
    await secondRound.questionCard.expectEnlargeLabel(false)
  })
})

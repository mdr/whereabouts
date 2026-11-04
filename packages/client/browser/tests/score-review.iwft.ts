// The score review against the Vite dev server: single guesses judged by
// keyboard and by clicking, a pair compared (pointing at one shows it
// alone), the export, and the screen on a phone. Saves screenshots.
import { expect } from "@playwright/test"
import { test } from "../coverage/coverage-test.ts"
import { decodeCase } from "@whereabouts/shared/scoring/scoring-case"
import { newOfflineTab } from "./iwft-tab.ts"
import { shot } from "./support.ts"

test("score-review", async ({ browser }) => {
  const tab = await newOfflineTab(browser, "review", { context: { viewport: { width: 1400, height: 900 } } })

  const review = await test.step("the review opens with nothing judged", async () => {
    const review = await tab.openScoreReview()
    await review.expectJudged(0)
    return review
  })

  await test.step("the verdicts are one Tab stop and the arrow keys move and choose", async () => {
    await review.expectVerdictsOneTabStop()
    await review.clickVerdictThenPress(0, "ArrowRight")
    await review.expectVerdictChosenAndFocused(1)
    await review.clickVerdictThenPress(-2, "ArrowUp")
    await review.expectVerdictChosenAndFocused(2)
  })

  // Judge the first single by keys and the next by clicking; compare the first pair.
  const firstScore = await test.step("judge two singles and compare a pair", async () => {
    let singles = 0
    let paired = false
    let firstScore = ""
    for (let i = 0; i < 32 && (singles < 2 || !paired); i++) {
      if (await review.isPair()) {
        if (paired) {
          await review.skip()
          continue
        }
        await review.expectPairScores()
        await review.map.expectShownPaintCells({ greaterThan: 0 })
        const both = await review.map.shownPaintCells()
        await review.screenshot(shot(`review-pair.png`))
        await review.hoverGuess(0)
        // Pointing at A shows it alone, then both again.
        await review.map.expectShownPaintCells({ greaterThan: 0, lessThan: both })
        await review.stopHovering()
        await review.map.expectShownPaintCells({ exactly: both })
        await review.judgeWithKeys(1)
        paired = true
      } else if (singles === 0) {
        await review.expectScoreIsInteger()
        firstScore = await review.score()
        await review.screenshot(shot(`review-single.png`))
        await review.judgeWithKeys(3)
        singles++
      } else if (singles === 1) {
        await review.judge(-1, 650, "Close enough for more")
        singles++
      } else await review.skip()
    }
    await review.expectJudged(3)
    return firstScore
  })

  await test.step("the export holds the verdicts", async () => {
    const verdicts = (await review.export())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    const single = verdicts.filter((verdict) => verdict["verdict"] !== undefined)
    const pair = verdicts.find((verdict) => verdict["pair"] === true)
    expect(
      single.map((verdict) => verdict["verdict"]),
      "the export holds both single verdicts"
    ).toEqual([0, -1])
    expect(single[1]?.["shouldBe"], "and the score the second should have been").toBe(650)
    expect(pair?.["prefer"], "the export holds the pair's verdict").toBe(-2)
    expect(pair?.["cases"], "and the pair's two cases").toHaveLength(2)
    const c = await decodeCase(single[0]!["case"] as string)
    expect(Math.round(c.score), "each case carries the score shown").toBe(Number(firstScore))
  })

  await test.step("the screen fits a phone", async () => {
    const phone = await newOfflineTab(browser, "phone", {
      context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
    })
    const onPhone = await phone.openScoreReview()
    await onPhone.expectFits("the score review on a phone")
    await onPhone.screenshot(shot(`review-phone.png`))
  })
})

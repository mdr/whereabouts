// The score review against the Vite dev server: single guesses judged by
// keyboard and by clicking, a pair compared (pointing at one shows it
// alone), the export, and the screen on a phone. Saves screenshots.
// Usage, from packages/client: node browser/e2e/score-review.ts [outDir]
import { decodeCase } from "@whereabouts/shared"
import { Checks, launchChrome, newTab, outDir } from "./support.ts"

const out = outDir()
const checks = new Checks()
const browser = await launchChrome()
const tab = await newTab(browser, "review", { context: { viewport: { width: 1400, height: 900 } } })

const review = await tab.openScoreReview()
checks.check((await review.progress()).startsWith("0 of 32"), "a set of 32, nothing judged yet")

// Judge the first single by keys and the next by clicking; compare the first pair.
let singles = 0
let paired = false
let firstScore = ""
for (let i = 0; i < 32 && (singles < 2 || !paired); i++) {
  if (await review.isPair()) {
    if (paired) {
      await review.skip()
      continue
    }
    const scores = await review.pairScores()
    checks.check(
      scores.length === 2 && scores.every((s) => /^\d+$/.test(s)),
      `a pair shows both scores (${scores.join(", ")})`
    )
    const both = await review.map.shownPaintCells()
    await review.screenshot(`${out}/review-pair.png`)
    await review.hoverGuess(0)
    const onlyA = await review.map.shownPaintCells()
    await review.stopHovering()
    const again = await review.map.shownPaintCells()
    checks.check(
      onlyA > 0 && onlyA < both && again === both,
      `pointing at A shows it alone (${onlyA} of ${both} cells), then both again`
    )
    await review.judgeWithKeys(1)
    paired = true
  } else if (singles === 0) {
    firstScore = await review.score()
    checks.check(/^\d+$/.test(firstScore), `a single guess shows its score (${firstScore})`)
    await review.screenshot(`${out}/review-single.png`)
    await review.judgeWithKeys(3)
    singles++
  } else if (singles === 1) {
    await review.judge(-1, 650, "Close enough for more")
    singles++
  } else await review.skip()
}
checks.check((await review.progress()).startsWith("3 of 32"), `three judged (${await review.progress()})`)

const verdicts = (await review.export())
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as Record<string, unknown>)
const single = verdicts.filter((v) => v.verdict !== undefined)
const pair = verdicts.find((v) => v.pair === true)
checks.check(
  single.length === 2 && single[0]!.verdict === 0 && single[1]!.verdict === -1 && single[1]!.shouldBe === 650,
  `the export holds both single verdicts, with the score it should be (${single.map((v) => String(v.verdict)).join(", ")})`
)
checks.check(pair?.prefer === -2 && (pair.cases as string[]).length === 2, "and the pair's, with both its cases")
const c = await decodeCase(single[0]!.case as string)
checks.check(Math.round(c.score) === Number(firstScore), `each case carries the score shown (${Math.round(c.score)})`)

const phone = await newTab(browser, "phone", {
  context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
})
const onPhone = await phone.openScoreReview()
const fit = await onPhone.fit()
checks.check(
  fit.scrollWidth <= fit.viewportWidth,
  `fits a phone's width (${fit.overflowing.join(", ") || "nothing over"})`
)
await onPhone.screenshot(`${out}/review-phone.png`)

await browser.close()
checks.finish()

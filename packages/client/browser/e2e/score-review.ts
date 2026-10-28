// The score review against the Vite dev server: a guess and its score, a
// verdict by keyboard and one by clicking, the export, and the screen on a
// phone. Saves screenshots.
// Usage, from packages/client: node browser/e2e/score-review.ts [outDir]
import { decodeCase } from "@whereabouts/shared"
import { Checks, launchChrome, newTab, outDir } from "./support.ts"

const out = outDir()
const checks = new Checks()
const browser = await launchChrome()
const tab = await newTab(browser, "review", { context: { viewport: { width: 1400, height: 900 } } })

const review = await tab.openScoreReview()
const first = await review.score()
checks.check(/^\d+$/.test(first), `a score to judge (${first})`)
checks.check((await review.progress()).startsWith("0 of 28"), "nothing judged yet")
await review.screenshot(`${out}/review-1.png`)

await review.judgeWithKeys(3)
checks.check((await review.progress()).startsWith("1 of 28"), "3 then Enter judges it 'about right'")
await review.judge(-1, 650, "Close enough for more")
checks.check((await review.progress()).startsWith("2 of 28"), "clicking judges the next one")
await review.screenshot(`${out}/review-2.png`)

const lines = (await review.export()).trim().split("\n")
const verdicts = lines.map((l) => JSON.parse(l) as { verdict: number; shouldBe?: number; note?: string; case: string })
checks.check(
  verdicts.length === 2 && verdicts[0]!.verdict === 0 && verdicts[1]!.verdict === -1,
  `the export holds both verdicts (${verdicts.map((v) => v.verdict).join(", ")})`
)
checks.check(
  verdicts[1]!.shouldBe === 650 && verdicts[1]!.note === "Close enough for more",
  "with the score it should be and the note"
)
const c = await decodeCase(verdicts[0]!.case)
checks.check(
  Math.round(c.score) === Number(first) && Object.keys(c.cells).length > 0,
  `and each case, with its paint and the score shown (${Math.round(c.score)})`
)

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

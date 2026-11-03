import { PageObject } from "./steps.ts"
import type { Page } from "@playwright/test"
import { HomePage } from "./HomePage.ts"
import { JoinAsPage } from "./JoinAsPage.ts"
import { LoadFailures } from "./LoadFailures.ts"
import { PracticeRoundPage } from "./PracticeRoundPage.ts"
import { ScoreReviewPage } from "./ScoreReviewPage.ts"
import { expectNumber, stillTrueFor } from "./support.ts"
import type { Ms } from "@whereabouts/shared/units"

/** One player's browser tab: where each test starts, and what it opens first. */
export class Tab extends PageObject {
  /** For instrumentation (network, audio); tests drive the app through the pages. */
  readonly page: Page
  readonly #baseUrl: string
  readonly #dev: boolean

  /** `dev` opens every page with the playtest drawer. */
  constructor(page: Page, baseUrl: string, { dev = false } = {}) {
    super()
    this.page = page
    this.#baseUrl = baseUrl.replace(/\/$/, "")
    this.#dev = dev
  }

  async #open(route: string): Promise<void> {
    await this.page.goto(`${this.#baseUrl}/${this.#dev ? "?dev" : ""}#${route}`, { waitUntil: "networkidle" })
  }

  async openHome(): Promise<HomePage> {
    await this.#open("/")
    return HomePage.whenShown(this)
  }

  async openScoreReview(): Promise<ScoreReviewPage> {
    await this.#open("/score-review")
    return ScoreReviewPage.whenShown(this)
  }

  async openPractice(): Promise<PracticeRoundPage> {
    await this.#open("/solo")
    return PracticeRoundPage.whenShown(this)
  }

  /** A screen that is expected not to load, with its downloads blocked. */
  async openFailing(route: "/solo" | "/score-review"): Promise<LoadFailures> {
    await this.page.goto(`${this.#baseUrl}/#${route}`)
    return new LoadFailures(this.page)
  }

  /** The link a host shares. */
  async openGameLink(code: string): Promise<JoinAsPage> {
    await this.#open(`/game/${code}`)
    return JoinAsPage.whenShown(this)
  }

  /** Starts counting requests for terrain tiles (the shaded relief, which gives mountains away). */
  countTerrainTileRequests(): {
    expectNone: (duration?: Ms) => Promise<void>
    expectSome: () => Promise<void>
  } {
    let requests = 0
    this.page.on("request", (request) => {
      if (request.url().includes("elevation-tiles-prod")) requests++
    })
    return {
      expectNone: (duration = 500) =>
        stillTrueFor(
          "no terrain tiles being requested",
          duration,
          () => Promise.resolve(requests),
          (count) => count === 0
        ),
      expectSome: () => expectNumber("terrain tiles are requested", () => Promise.resolve(requests), { greaterThan: 0 })
    }
  }
}

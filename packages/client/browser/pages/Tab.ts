import { PageObject } from "./steps.ts"
import type { Page } from "@playwright/test"
import { HomePage } from "./HomePage.ts"
import { JoinAsPage } from "./JoinAsPage.ts"
import { LoadFailures } from "./LoadFailures.ts"
import { DOWNLOAD_URL, type Download } from "./Download.ts"
import { Headset } from "./headset/Headset.ts"
import type { SoundEvent } from "./SoundEvent.ts"
import { PracticeRoundPage } from "./PracticeRoundPage.ts"
import { ScoreReviewPage } from "./ScoreReviewPage.ts"
import { expectNumber, expectPolled, stillTrueFor } from "./support.ts"
import {
  CLIENT_ERRORS_PATH,
  ClientErrorReportSchema,
  type ClientErrorKind,
  type ClientErrorReport
} from "@whereabouts/shared/protocol/client-error"
import type { GameConnection } from "../game-server/route-socket.ts"
import type { Instant, Ms } from "@whereabouts/shared/units"

/** One player's browser tab: where each test starts, and what it opens first. */
export class Tab extends PageObject {
  /** For instrumentation (network, audio); tests drive the app through the pages. */
  readonly page: Page
  readonly #baseUrl: string
  readonly #dev: boolean
  /** The tab's game connection, when it plays on the in-process server. */
  readonly connection: GameConnection | undefined
  readonly #clientErrors: ClientErrorReport[] = []
  readonly #failing = new Set<Download>()
  readonly #intercepted = new Set<Download>()

  /** `dev` opens every page with the playtest drawer. */
  constructor(
    page: Page,
    baseUrl: string,
    { dev = false, connection }: { dev?: boolean; connection?: GameConnection } = {}
  ) {
    super()
    this.page = page
    this.#baseUrl = baseUrl.replace(/\/$/, "")
    this.#dev = dev
    this.connection = connection
  }

  /** Keeps the page's error reports here instead of sending them to a server, so tests never add to a real one's logs. Before opening any page. */
  async collectClientErrors(): Promise<void> {
    await this.page.route(`**${CLIENT_ERRORS_PATH}`, (route) => {
      const report = ClientErrorReportSchema.safeParse(route.request().postDataJSON())
      if (report.success) this.#clientErrors.push(report.data)
      return route.fulfill({ status: 204 })
    })
  }

  /** The page told the server this kind of thing failed. */
  expectClientErrorReported(kind: ClientErrorKind): Promise<void> {
    return expectPolled(
      `a ${kind} report is sent`,
      kind,
      () => Promise.resolve(this.#clientErrors.map((report) => report.kind)),
      (kinds) => kinds.includes(kind),
      {}
    )
  }

  /** Make a download fail, as a dropped connection would, until `allowDownload`. */
  async failDownload(download: Download): Promise<void> {
    this.#failing.add(download)
    if (this.#intercepted.has(download)) return
    this.#intercepted.add(download)
    await this.page.route(DOWNLOAD_URL[download], (route) =>
      this.#failing.has(download) ? route.abort() : route.fallback()
    )
  }

  allowDownload(download: Download): void {
    this.#failing.delete(download)
  }

  /** Emulate a headset in this tab, before the page loads. */
  async installHeadset(): Promise<Headset> {
    return Headset.install(this.page)
  }

  /** The failure messages on whatever screen is showing. */
  loadFailures(): LoadFailures {
    return new LoadFailures(this.page)
  }

  async #open(route: string): Promise<void> {
    await this.page.goto(`${this.#baseUrl}/${this.#dev ? "?dev" : ""}#${route}`, { waitUntil: "networkidle" })
  }

  /** Take over the page's timers and clock, which then run at the normal rate until `fastForward`. Before opening any page. */
  installClock(): Promise<void> {
    return this.page.clock.install()
  }

  /** The page's date stays at `time` while its timers run as normal. Before opening any page. */
  holdDateAt(time: Instant): Promise<void> {
    return this.page.clock.setFixedTime(time)
  }

  /** Jump the page's clock on, firing the timers now due once. Needs `installClock`. */
  fastForward(time: Ms): Promise<void> {
    return this.page.clock.fastForward(time)
  }

  /** The page clock (performance.now()). */
  pageTime(): Promise<number> {
    return this.page.evaluate(() => performance.now())
  }

  /** Takes the sound events the page has recorded since the last call. */
  drainRecordedSounds(): Promise<SoundEvent[]> {
    return this.page.evaluate(() => window.__audio.splice(0))
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

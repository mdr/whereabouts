import type { Page } from "playwright-core"
import { HomePage } from "./HomePage.ts"
import { JoinAsPage } from "./JoinAsPage.ts"
import { PracticeRoundPage } from "./PracticeRoundPage.ts"

/** One player's browser tab: where each test starts, and what it opens first. */
export class Tab {
  /** For instrumentation (network, audio); tests drive the app through the pages. */
  readonly page: Page
  readonly #baseUrl: string
  readonly #dev: boolean

  /** `dev` opens every page with the playtest drawer. */
  constructor(page: Page, baseUrl: string, { dev = false } = {}) {
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

  async openPractice(): Promise<PracticeRoundPage> {
    await this.#open("/solo")
    return PracticeRoundPage.whenShown(this)
  }

  /** The link a host shares. */
  async openGameLink(code: string): Promise<JoinAsPage> {
    await this.#open(`/game/${code}`)
    return JoinAsPage.whenShown(this)
  }

  /** Starts counting requests for terrain tiles (the shaded relief, which gives mountains away). */
  countTerrainTileRequests(): { count: () => number } {
    let n = 0
    this.page.on("request", (r) => {
      if (r.url().includes("elevation-tiles-prod")) n++
    })
    return { count: () => n }
  }
}

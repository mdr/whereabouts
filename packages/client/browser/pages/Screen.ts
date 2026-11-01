import type { Page } from "@playwright/test"
import type { Tab } from "./Tab.ts"
import { until } from "./support.ts"
import type { Ms, Px } from "@whereabouts/shared/units"

export interface Fit {
  viewportWidth: Px
  scrollWidth: Px
  /** Elements reaching past either side of the screen, described for a failure message. */
  overflowing: string[]
}

/** What every screen can do, whichever it is. */
export abstract class Screen {
  protected readonly tab: Tab
  protected readonly page: Page

  constructor(tab: Tab) {
    this.tab = tab
    this.page = tab.page
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path })
  }

  /** Wait a while, for something that should not happen. */
  async pause(ms: Ms): Promise<void> {
    await this.page.waitForTimeout(ms)
  }

  /** Until nothing with a test id has moved or changed size for a third of a second. */
  async waitForLayoutToSettle(timeout: Ms = 10_000): Promise<void> {
    let previous = ""
    let stillSince = Date.now()
    await until(
      "the layout to settle",
      async () => {
        const layout = await this.page.evaluate(() =>
          [...document.querySelectorAll("[data-testid]")]
            .map((element) => {
              const { left, top, width, height } = element.getBoundingClientRect()
              return [left, top, width, height].map(Math.round).join(",")
            })
            .join(";")
        )
        if (layout !== previous) stillSince = Date.now()
        previous = layout
        return Date.now() - stillSince
      },
      (ms) => ms >= 300,
      timeout
    )
  }

  /** How the screen fits the width of the window. */
  async fit(): Promise<Fit> {
    return this.page.evaluate(() => {
      const vw = window.innerWidth
      const overflowing: string[] = []
      for (const el of document.querySelectorAll("body *")) {
        // The map canvas may be larger than the screen; its controls may not.
        if (el.closest(".maplibregl-map") && !el.closest(".maplibregl-ctrl")) continue
        const b = el.getBoundingClientRect()
        if (b.width > 0 && (b.right > vw + 1 || b.left < -1)) {
          const id = el.getAttribute("data-testid") ?? el.getAttribute("class") ?? ""
          overflowing.push(`${el.tagName.toLowerCase()} ${id} [${Math.round(b.left)}..${Math.round(b.right)}]`)
        }
      }
      return { viewportWidth: vw, scrollWidth: document.documentElement.scrollWidth, overflowing }
    })
  }
}

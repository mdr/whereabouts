import { PageObject } from "./steps.ts"
import { expect, type Page } from "@playwright/test"
import type { Tab } from "./Tab.ts"
import { softExpect } from "./support.ts"
import type { Ms, Px } from "@whereabouts/shared/units"

interface Fit {
  viewportWidth: Px
  scrollWidth: Px
  /** Elements reaching past either side of the screen, described for a failure message. */
  overflowing: string[]
}

/** What every screen can do, whichever it is. */
export abstract class Screen extends PageObject {
  protected readonly tab: Tab
  protected readonly page: Page

  constructor(tab: Tab) {
    super()
    this.tab = tab
    this.page = tab.page
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path })
  }

  /** Until nothing with a test id has moved or changed size for a third of a second. */
  async waitForLayoutToSettle(timeout: Ms = 10_000): Promise<void> {
    await this.#expectLayoutSettles(expect, timeout)
  }

  async #expectLayoutSettles(expector: typeof expect, timeout: Ms): Promise<void> {
    let previous = ""
    let stillSince = Date.now()
    await expector
      .poll(
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
        { message: "the layout settles", timeout, intervals: [100] }
      )
      .toBeGreaterThanOrEqual(300)
  }

  async #fit(): Promise<Fit> {
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

  /** Once the layout has settled, the screen is no wider than the window; `viewportWidth` is what the window should measure. */
  async expectFits(label: string, viewportWidth?: Px): Promise<void> {
    await this.#expectLayoutSettles(softExpect, 10_000)
    if (viewportWidth !== undefined) {
      await softExpect
        .poll(async () => (await this.#fit()).viewportWidth, {
          message: `${label}: the layout viewport is the screen width`
        })
        .toBe(viewportWidth)
    }
    await softExpect
      .poll(
        async () => {
          const { scrollWidth, viewportWidth: width } = await this.#fit()
          return scrollWidth - width
        },
        { message: `${label}: the page does not scroll horizontally` }
      )
      .toBeLessThanOrEqual(0)
    await softExpect
      .poll(async () => (await this.#fit()).overflowing, { message: `${label}: nothing overflows the screen` })
      .toEqual([])
  }
}

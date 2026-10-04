import type { Page } from "playwright-core";
import type { Tab } from "./Tab.ts";

export interface Fit {
  viewportWidth: number;
  scrollWidth: number;
  /** Elements reaching past either side of the screen, described for a failure message. */
  overflowing: string[];
}

/** What every screen can do, whichever it is. */
export abstract class Screen {
  protected readonly tab: Tab;
  protected readonly page: Page;

  constructor(tab: Tab) {
    this.tab = tab;
    this.page = tab.page;
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path });
  }

  /** Wait a while, for something that should not happen. */
  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /** How the screen fits the width of the window. */
  async fit(): Promise<Fit> {
    return this.page.evaluate(() => {
      const vw = window.innerWidth;
      const overflowing: string[] = [];
      for (const el of document.querySelectorAll("body *")) {
        // The map canvas may be larger than the screen; its controls may not.
        if (el.closest(".maplibregl-map") && !el.closest(".maplibregl-ctrl")) continue;
        const b = el.getBoundingClientRect();
        if (b.width > 0 && (b.right > vw + 1 || b.left < -1)) {
          const id = el.getAttribute("data-testid") ?? el.getAttribute("class") ?? "";
          overflowing.push(`${el.tagName.toLowerCase()} ${id} [${Math.round(b.left)}..${Math.round(b.right)}]`);
        }
      }
      return { viewportWidth: vw, scrollWidth: document.documentElement.scrollWidth, overflowing };
    });
  }
}

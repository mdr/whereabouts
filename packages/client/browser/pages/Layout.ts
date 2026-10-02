import type { Page } from "playwright-core";

export interface Fit {
  viewportWidth: number;
  scrollWidth: number;
  /** Elements reaching past either side of the screen, described for a failure message. */
  overflowing: string[];
}

/** The page as a whole, for checking it fits a small screen. */
export class Layout {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async fit(): Promise<Fit> {
    return this.#page.evaluate(() => {
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

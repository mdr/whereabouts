import type { Locator, Page } from "@playwright/test"
import type { Ms } from "@whereabouts/shared/units"

/** Poll `read` until `ok` accepts its value, or throw naming what was awaited and the last value seen. */
export const until = async <T>(
  what: string,
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  timeout: Ms = 10_000
): Promise<T> => {
  const end = Date.now() + timeout
  for (;;) {
    const value = await read()
    if (ok(value)) return value
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}; last saw ${JSON.stringify(value)}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** Elements with this test id whose `data-<attr>` is `value`. */
export const byTestIdWith = (scope: Page | Locator, testId: string, attr: string, value: string): Locator => {
  const quoted = value.replace(/["\\]/g, "\\$&")
  return scope.locator(`[data-testid="${testId}"][data-${attr}="${quoted}"]`)
}

/** Whether the element is entirely on screen and not covered by anything else. */
export const isUsable = async (locator: Locator): Promise<boolean> => {
  if ((await locator.count()) === 0) return false
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const onScreen =
      bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.top >= 0 && bounds.bottom <= window.innerHeight
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) ?? undefined
    return onScreen && hit !== undefined && (hit === element || element.contains(hit))
  })
}

/** Text with runs of whitespace collapsed. */
export const text = async (locator: Locator): Promise<string> =>
  ((await locator.textContent()) ?? "").replace(/\s+/g, " ").trim()

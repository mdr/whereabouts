import type { Locator, Page } from "playwright-core"

/** Poll `read` until `ok` accepts its value, or throw naming what was awaited and the last value seen. */
export async function until<T>(
  what: string,
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  timeoutMs = 10_000
): Promise<T> {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (ok(value)) return value
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}; last saw ${JSON.stringify(value)}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

/** Elements with this test id whose `data-<attr>` is `value`. */
export function byTestIdWith(scope: Page | Locator, testId: string, attr: string, value: string): Locator {
  const quoted = value.replace(/["\\]/g, "\\$&")
  return scope.locator(`[data-testid="${testId}"][data-${attr}="${quoted}"]`)
}

/** Whether the element is entirely on screen and not covered by anything else. */
export async function isUsable(locator: Locator): Promise<boolean> {
  if ((await locator.count()) === 0) return false
  return locator.evaluate((el) => {
    const b = el.getBoundingClientRect()
    const onScreen = b.left >= 0 && b.right <= window.innerWidth && b.top >= 0 && b.bottom <= window.innerHeight
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return onScreen && hit !== null && (hit === el || el.contains(hit))
  })
}

/** Text with runs of whitespace collapsed. */
export async function text(locator: Locator): Promise<string> {
  return ((await locator.textContent()) ?? "").replace(/\s+/g, " ").trim()
}

import { expect, type Locator, type Page } from "@playwright/test"
import { HintAxis } from "@whereabouts/shared/hints"
import type { Ms } from "@whereabouts/shared/units"

const POLL_INTERVAL: Ms = 100

const nextPoll = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))

/** Check, for `duration`, that `ok` keeps accepting what `read` gives; fails as soon as it does not. */
export const stillTrueFor = async <T>(
  what: string,
  duration: Ms,
  read: () => Promise<T>,
  ok: (value: T) => boolean
): Promise<void> => {
  const end = Date.now() + duration
  do {
    const value = await read()
    if (!ok(value)) throw new Error(`${what} stopped being true; saw ${JSON.stringify(value)}`)
    await nextPoll()
  } while (Date.now() < end)
}

/** The delay between steps of a scripted gesture, so the page sees it as movement rather than a jump. */
export const paceGesture = async (page: Page, duration: Ms): Promise<void> => {
  // oxlint-disable-next-line eslint-js/no-restricted-syntax
  await page.waitForTimeout(duration)
}

/** Press, wait for `expectation` to hold, then release, whether or not it did. */
export const holdUntil = async (
  press: () => Promise<void>,
  expectation: () => Promise<void>,
  release: () => Promise<void>
): Promise<void> => {
  await press()
  try {
    await expectation()
  } finally {
    await release()
  }
}

/** Elements with this test id whose `data-<attr>` is `value`. */
export const byTestIdWith = (scope: Page | Locator, testId: string, attr: string, value: string): Locator => {
  const quoted = value.replace(/["\\]/g, "\\$&")
  return scope.locator(`[data-testid="${testId}"][data-${attr}="${quoted}"]`)
}

/** Layout checks use this, so one failure still lets the run report the rest. */
export const softExpect = expect.configure({ soft: true })

/** Bounds on a number; every one given must hold. */
export interface Bounds {
  exactly?: number
  atLeast?: number
  atMost?: number
  greaterThan?: number
  lessThan?: number
}

const describeBounds = ({ exactly, atLeast, atMost, greaterThan, lessThan }: Bounds): string =>
  [
    exactly !== undefined && `exactly ${exactly}`,
    atLeast !== undefined && `at least ${atLeast}`,
    atMost !== undefined && `at most ${atMost}`,
    greaterThan !== undefined && `more than ${greaterThan}`,
    lessThan !== undefined && `fewer than ${lessThan}`
  ]
    .filter((part) => part !== false)
    .join(" and ")

const withinBounds = (value: number, { exactly, atLeast, atMost, greaterThan, lessThan }: Bounds): boolean =>
  (exactly === undefined || value === exactly) &&
  (atLeast === undefined || value >= atLeast) &&
  (atMost === undefined || value <= atMost) &&
  (greaterThan === undefined || value > greaterThan) &&
  (lessThan === undefined || value < lessThan)

export interface PollOptions {
  timeout?: Ms
  expector?: typeof expect
}

/** Polls `read` until `ok` accepts its value; a failure shows the last value seen against what was wanted. */
export const expectPolled = async <T>(
  message: string,
  wanted: string,
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  { timeout, expector = expect }: PollOptions = {}
): Promise<void> => {
  await expector
    .poll(
      async () => {
        const value = await read()
        return ok(value) ? wanted : JSON.stringify(value)
      },
      { message, timeout }
    )
    .toBe(wanted)
}

/** Polls a number until it is within `bounds`. */
export const expectNumber = (
  message: string,
  read: () => Promise<number>,
  bounds: Bounds,
  options: PollOptions = {}
): Promise<void> => expectPolled(message, describeBounds(bounds), read, (value) => withinBounds(value, bounds), options)

/** Whether the element is entirely on screen and not covered by anything else. */
const isUsable = async (locator: Locator): Promise<boolean> => {
  if ((await locator.count()) === 0) return false
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const onScreen =
      bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.top >= 0 && bounds.bottom <= window.innerHeight
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) ?? undefined
    return onScreen && hit !== undefined && (hit === element || element.contains(hit))
  })
}

/** Until the element is on screen and uncovered. */
export const expectUsable = async (locator: Locator, message: string): Promise<void> => {
  await softExpect.poll(() => isUsable(locator), { message }).toBe(true)
}

const HINT_BANDS: Record<HintAxis, RegExp> = {
  [HintAxis.LATITUDE]: /^\s*Between \d+(\.\d)?°[NS]? and \d+(\.\d)?°[NS]?\s*$/,
  [HintAxis.LONGITUDE]: /^\s*Between [\d.]+°[EW]? and [\d.]+°[EW]?\s*$/
}

/** The hint's band reads "Between 12°N and 40°N" (or °E/°W for longitude). */
export const expectHintBand = async (band: Locator, axis: HintAxis): Promise<void> => {
  await expect(band, "the hint names a band").toHaveText(HINT_BANDS[axis])
}

/** Text with runs of whitespace collapsed. */
export const text = async (locator: Locator): Promise<string> =>
  ((await locator.textContent()) ?? "").replace(/\s+/g, " ").trim()

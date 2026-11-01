import type { Page } from "@playwright/test"
import type {} from "../../../src/test-hooks.ts"
import type { VrProbe } from "../../../src/vr/probe.ts"
import { expectNumber, expectPolled, type Bounds, type PollOptions } from "../support.ts"

/** One of the headset scene's probe readings. */
export const probe = async <K extends keyof VrProbe>(page: Page, key: K): Promise<VrProbe[K]> =>
  (await page.evaluate((name) => window.testHooks.vr!.probe[name], key)) as VrProbe[K]

/** The emulator can stall for a second or more, so the scene gets longer than a page does. */
const withVrTimeout = (options: PollOptions): PollOptions => ({ timeout: 10_000, ...options })

type NumericProbe = { [K in keyof VrProbe]: VrProbe[K] extends number ? K : never }[keyof VrProbe]

/** Polls a probe reading until `ok` accepts it. */
export const expectProbe = <K extends keyof VrProbe>(
  page: Page,
  key: K,
  message: string,
  wanted: string,
  ok: (value: VrProbe[K]) => boolean,
  options: PollOptions = {}
): Promise<void> => expectPolled(message, wanted, () => probe(page, key), ok, withVrTimeout(options))

/** Polls a numeric probe reading until it is within `bounds`. */
export const expectProbeNumber = (
  page: Page,
  key: NumericProbe,
  message: string,
  bounds: Bounds,
  options: PollOptions = {}
): Promise<void> => expectNumber(message, () => probe(page, key), bounds, withVrTimeout(options))

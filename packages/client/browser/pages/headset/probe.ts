import type { Page } from "@playwright/test"
import type {} from "../../../src/test-hooks.ts"
import type { VrProbe } from "../../../src/vr/probe.ts"

/** One of the headset scene's probe readings. */
export const probe = async <K extends keyof VrProbe>(page: Page, key: K): Promise<VrProbe[K]> =>
  (await page.evaluate((name) => window.testHooks.vr!.probe[name], key)) as VrProbe[K]

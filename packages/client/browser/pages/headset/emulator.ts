import { createRequire } from "node:module"
import type { Page } from "@playwright/test"

declare global {
  interface Window {
    /** iwer's browser build. */
    IWER: {
      XRDevice: new (config: unknown, options: { stereoEnabled: boolean }) => EmulatedHeadset
      metaQuest3: unknown
    }
    headset: EmulatedHeadset
  }
}

interface EmulatedHeadset {
  position: { x: number; y: number; z: number }
  controllers: Partial<Record<"left" | "right", EmulatedController>>
  activeSession: unknown
  installRuntime(options: { forceInstall: boolean }): void
}

interface EmulatedController {
  position: { x: number; y: number; z: number }
  quaternion: { set(x: number, y: number, z: number, w: number): void }
  updateButtonValue(id: string, value: number): void
  updateAxes(id: string, x: number, y: number): void
}

/** Put an emulated Meta Quest 3 (Meta's IWER) in place of WebXR. Install before the page loads. */
export async function installEmulator(page: Page): Promise<void> {
  const iwer = createRequire(import.meta.url).resolve("iwer/build/iwer.min.js")
  await page.context().addInitScript({ path: iwer })
  await page.context().addInitScript(() => {
    const { XRDevice, metaQuest3 } = window.IWER
    const device = new XRDevice(metaQuest3, { stereoEnabled: false })
    // Desktop Chrome has a WebXR of its own, with no headset.
    device.installRuntime({ forceInstall: true })
    window.headset = device

    // A standalone headset such as the Quest runs none of the page's
    // animation frames while a session shows (the WebXR spec allows it);
    // hold them until it ends. The emulator's own frame loop must still run.
    const run = window.requestAnimationFrame.bind(window)
    const cancel = window.cancelAnimationFrame.bind(window)
    const held = new Map<number, FrameRequestCallback>()
    let nextHeld = -1
    window.requestAnimationFrame = (callback) => {
      if (device.activeSession === undefined || callback.name === "onDeviceFrame") return run(callback)
      held.set(nextHeld, callback)
      return nextHeld--
    }
    window.cancelAnimationFrame = (handle) => (handle < 0 ? void held.delete(handle) : cancel(handle))
    setInterval(() => {
      if (device.activeSession !== undefined) return
      for (const callback of held.values()) run(callback)
      held.clear()
    }, 50)
  })
}

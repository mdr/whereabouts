/**
 * Whether this browser can open a VR headset session, asked once at startup,
 * and the VR code (its own chunk, several MB), loaded the first time a
 * player asks for VR and kept from then on.
 */
import { signal } from "@preact/signals"
import type { Vr } from "./vr"

export const vrSupported = signal(false)
/** The VR code, once loaded. */
export const loadedVr = signal<Vr | undefined>(undefined)

navigator.xr?.isSessionSupported("immersive-vr").then(
  (ok) => (vrSupported.value = ok),
  () => (vrSupported.value = false)
)

let loading: Promise<Vr> | undefined = undefined

export function loadVr(): Promise<Vr> {
  return (loading ??= import("./vr").then(
    async (m) => (loadedVr.value = await m.Vr.create()),
    (err: unknown) => {
      // Let the next press try again, after a dropped connection say.
      loading = undefined
      throw err
    }
  ))
}

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

/** How far loading has got, in order. */
export const VR_LOAD_STAGES = ["code", "headset", "land"] as const
export type VrLoadStage = (typeof VR_LOAD_STAGES)[number]
export const vrLoadStage = signal<VrLoadStage>("code")

navigator.xr?.isSessionSupported("immersive-vr").then(
  (ok) => (vrSupported.value = ok),
  () => (vrSupported.value = false)
)

/**
 * The VR code itself did not arrive. Chrome never fetches a failed import
 * again, so only a reload can fix it.
 */
export class VrCodeMissing extends Error {}

let loading: Promise<Vr> | undefined = undefined

export function loadVr(): Promise<Vr> {
  if (!loading) vrLoadStage.value = "code"
  loading ??= (async () => {
    const m = await import("./vr").catch((err: unknown) => {
      throw new VrCodeMissing("the VR code did not load", { cause: err })
    })
    return (loadedVr.value = await m.Vr.create((stage) => (vrLoadStage.value = stage)))
  })().catch((err: unknown) => {
    // Let the next press try again, after a dropped connection say.
    loading = undefined
    throw err
  })
  return loading
}

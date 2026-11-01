/**
 * Whether this browser can open a VR headset session, asked once at startup,
 * and the VR code (its own chunk, several MB), loaded the first time a
 * player asks for VR and kept from then on.
 */
import { signal } from "@preact/signals"
import type { Vr } from "./index"

export const vrSupported = signal(false)
/** The VR code, once loaded. */
export const loadedVr = signal<Vr | undefined>(undefined)

/** How far loading has got, in order. */
export enum VrLoadStage {
  CODE = "CODE",
  HEADSET = "HEADSET",
  LAND = "LAND"
}
export const VR_LOAD_STAGES: readonly VrLoadStage[] = Object.values(VrLoadStage)
export const vrLoadStage = signal(VrLoadStage.CODE)

navigator.xr?.isSessionSupported("immersive-vr").then(
  (supported) => (vrSupported.value = supported),
  () => (vrSupported.value = false)
)

/**
 * The VR code itself did not arrive. Chrome never fetches a failed import
 * again, so only a reload can fix it.
 */
export class VrCodeMissing extends Error {}

let loading: Promise<Vr> | undefined = undefined

export function loadVr(): Promise<Vr> {
  if (!loading) vrLoadStage.value = VrLoadStage.CODE
  loading ??= (async () => {
    const loaded = await import("./index").catch((error: unknown) => {
      throw new VrCodeMissing("the VR code did not load", { cause: error })
    })
    return (loadedVr.value = await loaded.Vr.create((stage) => (vrLoadStage.value = stage)))
  })().catch((error: unknown) => {
    // Let the next press try again, after a dropped connection say.
    loading = undefined
    throw error
  })
  return loading
}

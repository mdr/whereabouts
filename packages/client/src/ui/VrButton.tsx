import { useEffect, useRef, useState } from "preact/hooks"
import type { Vr, VrView } from "../vr"
import { loadVr, loadedVr, vrSupported } from "../vr-support"
import { usePaint } from "./MapView"
import { Icon } from "./icons"
import { vrButtonTestIds } from "./VrButtonTestIds"

/**
 * Keep the headset showing what the screen shows: the round, its answer,
 * the final score. `key` changes when that moves on; leaving the screen
 * takes the headset off.
 */
export function useVrView(view: VrView, key: string): void {
  // The headset calls back long after this render; it should reach the screen as it is then.
  const latest = useRef(view)
  latest.current = view
  const vr = loadedVr.value
  const active = vr?.active.value ?? false
  useEffect(() => {
    if (vr && active) vr.show(latest.current)
  }, [vr, active, key])
  useEffect(() => () => loadedVr.value?.exit(), [])
}

/**
 * Paint this round in a VR headset. Shown only where the browser can open
 * one. The first press loads the VR code; the headset opens once it has,
 * or on a second press if the browser no longer counts the first as the
 * player's.
 */
export function VrButton({ view }: { view: VrView }) {
  const paint = usePaint()
  const [loading, setLoading] = useState(false)
  const latest = useRef(view)
  latest.current = view

  if (!vrSupported.value) return undefined
  const vr = loadedVr.value
  const enter = (v: Vr) => v.enter(latest.current)
  const press = () => {
    if (vr) return enter(vr)
    setLoading(true)
    loadVr().then(
      (v) => {
        setLoading(false)
        enter(v)
      },
      (err: unknown) => {
        setLoading(false)
        console.warn("could not load VR", err)
      }
    )
  }
  const inVr = vr?.active.value ?? false
  return (
    <button
      onClick={press}
      disabled={loading || inVr || !paint.enabled.value}
      title="Paint this round in your VR headset"
      data-testid={vrButtonTestIds.button}
    >
      <Icon name="vr" /> <span class="label">{loading ? "Loading VR…" : inVr ? "In VR" : "VR"}</span>
    </button>
  )
}

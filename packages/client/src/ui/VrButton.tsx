import { useEffect, useRef, useState } from "preact/hooks"
import { effect } from "@preact/signals"
import type { MapDetail } from "@whereabouts/shared"
import type { Vr } from "../vr"
import { loadVr, vrSupported } from "../vr-support"
import { usePaint } from "./MapView"
import { Icon } from "./icons"
import { vrButtonTestIds } from "./VrButtonTestIds"

/**
 * Paint this round in a VR headset. Shown only where the browser can open
 * one. The first press loads the VR code; the headset opens once it has,
 * or on a second press if the browser no longer counts the first as the
 * player's.
 */
export function VrButton({ prompt, detail, submit }: { prompt: string; detail: MapDetail; submit: () => void }) {
  const paint = usePaint()
  const [vr, setVr] = useState<Vr | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  // The headset calls back long after this render; it should reach the round as it is then.
  const latest = useRef({ prompt, detail, submit })
  latest.current = { prompt, detail, submit }

  // Painting stopping (the round ending) takes the headset off too.
  useEffect(() => {
    if (!vr) return
    return effect(() => {
      if (!paint.enabled.value) vr.exit()
    })
  }, [vr, paint])

  if (!vrSupported.value) return undefined
  const enter = (v: Vr) => v.enter({ ...latest.current, paint, submit: () => latest.current.submit() })
  const press = () => {
    if (vr) return enter(vr)
    setLoading(true)
    loadVr().then(
      (v) => {
        setVr(v)
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

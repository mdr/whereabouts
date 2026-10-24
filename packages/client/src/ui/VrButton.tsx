import { createPortal } from "preact/compat"
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
 * one. The first press loads the VR code. A headset opens only in answer to
 * a press the browser still counts as the player's, a few seconds at most,
 * and loading can take longer: then a second, larger button asks again.
 */
export function VrButton({ view }: { view: VrView }) {
  const paint = usePaint()
  const [stage, setStage] = useState<"loading" | "ready" | undefined>(undefined)
  const latest = useRef(view)
  latest.current = view

  if (!vrSupported.value) return undefined
  const vr = loadedVr.value
  const enter = (v: Vr) => {
    setStage(undefined)
    v.enter(latest.current)
  }
  const press = () => {
    if (vr) return enter(vr)
    setStage("loading")
    loadVr().then(
      (v) => {
        if (navigator.userActivation.isActive) enter(v)
        else setStage("ready")
      },
      (err: unknown) => {
        setStage(undefined)
        console.warn("could not load VR", err)
      }
    )
  }
  const inVr = vr?.active.value ?? false
  return (
    <>
      <button
        onClick={press}
        disabled={stage !== undefined || inVr || !paint.enabled.value}
        title="Paint this round in your VR headset"
        data-testid={vrButtonTestIds.button}
      >
        <Icon name="vr" /> <span class="label">{inVr ? "In VR" : "VR"}</span>
      </button>
      {stage &&
        // Into <body>: the toolbar is transformed, and would be the box a fixed overlay fills.
        createPortal(
          <div class="modal-backdrop vr-launch" data-testid={vrButtonTestIds.loading}>
            {stage === "loading" ? (
              <p>Loading VR…</p>
            ) : (
              <div class="vr-launch-ready">
                <button class="primary" onClick={() => vr && enter(vr)} data-testid={vrButtonTestIds.enterButton}>
                  <Icon name="vr" /> Enter VR
                </button>
                <button onClick={() => setStage(undefined)} data-testid={vrButtonTestIds.cancelButton}>
                  Not now
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  )
}

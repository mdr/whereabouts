import { createPortal } from "preact/compat"
import { useEffect, useRef, useState } from "preact/hooks"
import type { Vr, VrView } from "../vr"
import {
  VR_LOAD_STAGES,
  VrCodeMissing,
  loadVr,
  loadedVr,
  vrLoadStage,
  vrSupported,
  type VrLoadStage
} from "../vr-support"
import { Icon } from "./icons"
import { vrButtonTestIds } from "./VrButtonTestIds"

/** How many screens now keep the headset on. */
let showing = 0
/** Long enough for the next screen's effects, which wait for a frame or 100 ms. */
const HANDOVER_MS = 500

/**
 * Keep the headset showing what the screen shows: the menu, the round, its
 * answer, the final score. `key` changes when that moves on to something
 * new; between, each render passes on what changed, such as the clock or
 * who is ready. The headset comes off when the player goes where it has
 * nothing to show.
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
  useEffect(() => {
    if (vr && active) vr.refresh(latest.current)
  })
  useVrHold()
}

/**
 * Keep the headset on while this screen shows, though it has nothing for
 * the headset yet: a game or practice still loading.
 */
export function useVrHold(): void {
  useEffect(() => {
    showing++
    return () => {
      showing--
      setTimeout(() => {
        if (showing === 0) loadedVr.value?.exit()
      }, HANDOVER_MS)
    }
  }, [])
}

/**
 * Play in a VR headset. Shown only where the browser can open
 * one. The first press loads the VR code. A headset opens only in answer to
 * a press the browser still counts as the player's, a few seconds at most,
 * and loading can take longer: then a second, larger button asks again.
 */
export function VrButton({ view }: { view: VrView }) {
  const [stage, setStage] = useState<"loading" | "ready" | "failed" | "codeMissing" | undefined>(undefined)
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
        console.warn("could not load VR", err)
        setStage(err instanceof VrCodeMissing ? "codeMissing" : "failed")
      }
    )
  }
  const inVr = vr?.active.value ?? false
  return (
    <>
      <button
        onClick={press}
        disabled={stage !== undefined || inVr}
        title="Play in your VR headset"
        data-testid={vrButtonTestIds.button}
      >
        <Icon name="vr" /> <span class="label">{inVr ? "In VR" : "VR"}</span>
      </button>
      {stage &&
        // Into <body>: the toolbar is transformed, and would be the box a fixed overlay fills.
        createPortal(
          <div class="modal-backdrop vr-launch" data-testid={vrButtonTestIds.loading}>
            {stage === "loading" ? (
              <VrLoading stage={vrLoadStage.value} />
            ) : stage === "failed" || stage === "codeMissing" ? (
              <div class="vr-launch-ready" role="alert" data-testid={vrButtonTestIds.failed}>
                <p>Couldn't start VR. Check your connection.</p>
                {stage === "failed" ? (
                  <button class="primary" onClick={press} data-testid={vrButtonTestIds.retryButton}>
                    Try again
                  </button>
                ) : (
                  <button class="primary" onClick={() => location.reload()} data-testid={vrButtonTestIds.reloadButton}>
                    Reload the page
                  </button>
                )}
                <button onClick={() => setStage(undefined)} data-testid={vrButtonTestIds.cancelButton}>
                  Close
                </button>
              </div>
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

const STAGE_TEXT: Record<VrLoadStage, string> = {
  code: "Fetching the paint and the globe",
  headset: "Setting up the headset",
  land: "Drawing the land"
}

/** A globe turning while the VR code loads, filling with paint stage by stage. */
function VrLoading({ stage }: { stage: VrLoadStage }) {
  const done = VR_LOAD_STAGES.indexOf(stage)
  return (
    <div class="vr-loading" role="status">
      <div class="vr-loading-globe" aria-hidden="true">
        <div class="vr-loading-land" />
        <div class="vr-loading-spray" style={{ opacity: 0.25 + (0.75 * (done + 1)) / VR_LOAD_STAGES.length }} />
      </div>
      <p>{STAGE_TEXT[stage]}…</p>
      <ol class="vr-loading-steps" data-testid={vrButtonTestIds.loadingStage} data-stage={stage}>
        {VR_LOAD_STAGES.map((s, i) => (
          <li key={s} class={i < done ? "done" : i === done ? "now" : undefined} />
        ))}
      </ol>
    </div>
  )
}

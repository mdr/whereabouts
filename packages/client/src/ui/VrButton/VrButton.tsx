import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { reportClientError } from "../../net/client-error/report-client-error"
import { createPortal } from "preact/compat"
import { useEffect, useRef, useState } from "preact/hooks"
import type { Vr } from "../../vr/index"
import { sceneOf, type VrView } from "../../vr/view/view"
import { VrCodeMissing, loadVr, loadedVr, vrLoadStage, vrSupported } from "../../vr/vr-support"
import { VR_LOAD_STAGES, VrLoadStage } from "../../vr/load-stage"
import { Icon } from "../icons"
import { vrButtonTestIds } from "./VrButtonTestIds"
import styles from "./VrButton.module.css"
import type { Ms } from "@whereabouts/shared/units"

/** Where a press of the VR button has got: the overlay it shows until the headset opens. */
enum LaunchStage {
  LOADING = "LOADING",
  /** Loaded, but too late for the press: asks for another. */
  READY = "READY",
  FAILED = "FAILED",
  /** Only a reload can fetch the VR code. */
  CODE_MISSING = "CODE_MISSING"
}

/** How many screens now keep the headset on. */
let showing = 0
/** Long enough for the next screen's effects, which wait for a frame or 100 ms. */
const HANDOVER: Ms = 500

/**
 * Keep the headset showing what the screen shows: the menu, the round, its
 * answer, the final score. A new scene (sceneOf) is set up afresh; between,
 * each render passes on what changed, such as the clock or who is ready.
 * The headset comes off when the player goes where it has nothing to show.
 */
export const useVrView = (view: VrView): void => {
  // The headset calls back long after this render; it should reach the screen as it is then.
  const latest = useRef(view)
  latest.current = view
  const vr = loadedVr.value
  const active = vr?.active.value ?? false
  const scene = sceneOf(view)
  useEffect(() => {
    if (vr && active) vr.show(latest.current)
  }, [vr, active, scene])
  useEffect(() => {
    if (vr && active) vr.refresh(latest.current)
  })
  useVrHold()
}

/**
 * Keep the headset on while this screen shows, though it has nothing for
 * the headset yet: a game or practice still loading.
 */
export const useVrHold = (): void => {
  useEffect(() => {
    showing++
    return () => {
      showing--
      setTimeout(() => {
        if (showing === 0) loadedVr.value?.exit()
      }, HANDOVER)
    }
  }, [])
}

/**
 * Play in a VR headset. Shown only where the browser can open
 * one. The first press loads the VR code. A headset opens only in answer to
 * a press the browser still counts as the player's, a few seconds at most,
 * and loading can take longer: then a second, larger button asks again.
 */
export const VrButton = ({ view }: { view: VrView }) => {
  const [stage, setStage] = useState<LaunchStage | undefined>(undefined)
  const latest = useRef(view)
  latest.current = view

  if (!vrSupported.value) return undefined
  const vr = loadedVr.value
  const enter = (loaded: Vr) => {
    setStage(undefined)
    loaded.enter(latest.current)
  }
  const press = () => {
    if (vr) return enter(vr)
    setStage(LaunchStage.LOADING)
    loadVr().then(
      (loaded) => {
        if (navigator.userActivation.isActive) enter(loaded)
        else setStage(LaunchStage.READY)
      },
      (error: unknown) => {
        console.warn("could not load VR", error)
        reportClientError(error instanceof VrCodeMissing ? ClientErrorKind.VR_CODE : ClientErrorKind.VR_LOAD, error)
        setStage(error instanceof VrCodeMissing ? LaunchStage.CODE_MISSING : LaunchStage.FAILED)
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
        <Icon name="vr" /> <span data-testid={inVr ? vrButtonTestIds.inVr : undefined}>{inVr ? "In VR" : "VR"}</span>
      </button>
      {stage &&
        // Into <body>: the toolbar is transformed, and would be the box a fixed overlay fills.
        createPortal(
          <div class={styles.launch} data-testid={vrButtonTestIds.loading}>
            {stage === LaunchStage.LOADING ? (
              <VrLoading stage={vrLoadStage.value} />
            ) : stage === LaunchStage.FAILED || stage === LaunchStage.CODE_MISSING ? (
              <div class={styles.ready} role="alert" data-testid={vrButtonTestIds.failed}>
                <p>Couldn't start VR. Check your connection.</p>
                {stage === LaunchStage.FAILED ? (
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
              <div class={styles.ready}>
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
  [VrLoadStage.CODE]: "Fetching the paint and the globe",
  [VrLoadStage.HEADSET]: "Setting up the headset",
  [VrLoadStage.LAND]: "Drawing the land"
}

/** A globe turning while the VR code loads, filling with paint stage by stage. */
const VrLoading = ({ stage }: { stage: VrLoadStage }) => {
  const done = VR_LOAD_STAGES.indexOf(stage)
  return (
    <div class={styles.loading} role="status">
      <div class={styles.globe} aria-hidden="true">
        <div class={styles.land} />
        <div class={styles.spray} style={{ opacity: 0.25 + (0.75 * (done + 1)) / VR_LOAD_STAGES.length }} />
      </div>
      <p>{STAGE_TEXT[stage]}…</p>
      <ol class={styles.steps} data-testid={vrButtonTestIds.loadingStage} data-stage={stage}>
        {VR_LOAD_STAGES.map((step, i) => (
          <li key={step} class={i < done ? styles.done : i === done ? styles.now : undefined} />
        ))}
      </ol>
    </div>
  )
}

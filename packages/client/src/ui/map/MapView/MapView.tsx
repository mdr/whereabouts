/**
 * Mounts the MapLibre map once and hands a PaintController to children via
 * context. The map fills the screen; children are HUD overlays positioned on
 * top of it, plus the developer drawer when dev mode is on.
 */
import { createContext } from "preact"
import { useContext, useEffect, useState } from "preact/hooks"
import { useElementRef } from "../../element-ref"
import type { ComponentChildren } from "preact"
import { GameMap } from "../../../map/map"
import { PaintController } from "../../../paint/paint-controller"
import { THEME } from "../../../map/themes"
import { devMode } from "../../dev/dev"
import { effect } from "@preact/signals"
import { sound } from "../../../sound/sound"
import { globeView, soundOn } from "../../../settings/settings"
import { mapViewTestIds } from "./MapViewTestIds"
import { Hud, HudTop } from "../Hud/Hud"
import { Card } from "../../Card/Card"
import { cx } from "../../cx"
import kit from "../../kit.module.css"
import { Tool } from "../../../paint/tool"
import styles from "./MapView.module.css"
import { MapDetail } from "@whereabouts/shared/protocol"

const PaintContext = createContext<PaintController | undefined>(undefined)

export function usePaint(): PaintController {
  const paint = useContext(PaintContext)
  if (!paint) throw new Error("usePaint outside MapView")
  return paint
}

export function MapView({ children }: { children: ComponentChildren }) {
  const mapElement = useElementRef<HTMLDivElement>()
  const [controller, setController] = useState<PaintController | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const gameMap = new GameMap(mapElement.current!)
    let paintController: PaintController | undefined = undefined
    let retry: ReturnType<typeof setTimeout> | undefined = undefined
    gameMap.ready.then(
      () => {
        gameMap.applyTheme(THEME)
        // Anything that would give the location away stays hidden.
        gameMap.setDetail(MapDetail.MINIMAL)
        gameMap.addGlobeButton(() => (globeView.value = !globeView.value), mapViewTestIds.globeButton)
        paintController = new PaintController(gameMap)
        window.whereabouts = { map: gameMap.map, gameMap, paint: paintController }
        setController(paintController)
      },
      (error: unknown) => {
        console.warn("could not load the map", error)
        // One quiet try before troubling the player.
        if (attempt === 0) retry = setTimeout(() => setAttempt(1), 2000)
        else setFailed(true)
      }
    )
    return () => {
      clearTimeout(retry)
      paintController?.dispose()
      gameMap.dispose()
    }
  }, [attempt])

  useEffect(() => {
    if (!controller) return
    return effect(() => controller.gameMap.setGlobe(globeView.value))
  }, [controller])

  // The spray (or the eraser) plays while a stroke is held and painting is
  // allowed; it stops when the stroke ends, the round locks you out, or the
  // map goes.
  useEffect(() => {
    if (!controller) return
    const stop = effect(() => {
      const tool = controller.enabled.value && soundOn.value ? controller.stroking.value : undefined
      sound.setStroke(tool === Tool.PAINT ? "spray" : tool === Tool.ERASE ? "eraser" : undefined)
    })
    return () => {
      stop()
      sound.setStroke(undefined)
    }
  }, [controller])

  // Belt and braces with touch-action in MapView.module.css: Safari ignores the
  // viewport's user-scalable, and cancelling its own gesture events is the
  // known way to stop it zooming the page on a pinch. Only while a map
  // screen is up; MapLibre and the photo lightbox read touch and pointer
  // events, which this leaves alone.
  useEffect(() => {
    const block = (event: Event) => event.preventDefault()
    const types = ["gesturestart", "gesturechange", "gestureend"]
    for (const type of types) document.addEventListener(type, block, { passive: false })
    return () => {
      for (const type of types) document.removeEventListener(type, block)
    }
  }, [])

  // The drawer takes a strip off the right, so the map must resize with it.
  const dev = devMode.value
  useEffect(() => {
    controller?.gameMap.map.resize()
  }, [dev, controller])

  return (
    <div class={cx(styles.stage, dev && styles.dev)}>
      <div class={styles.map} ref={mapElement} data-testid={mapViewTestIds.map} />
      <PaintContext.Provider value={controller}>
        {controller ? (
          children
        ) : (
          <Hud>
            <HudTop>
              {failed ? (
                <Card data-testid={mapViewTestIds.failed}>
                  <p>Couldn't load the map. Check your connection.</p>
                  <button
                    class="primary"
                    onClick={() => {
                      setFailed(false)
                      setAttempt(attempt + 1)
                    }}
                    data-testid={mapViewTestIds.retryButton}
                  >
                    Try again
                  </button>
                </Card>
              ) : (
                <Card>
                  <p class={kit.hint} data-testid={mapViewTestIds.loading}>
                    Loading map…
                  </p>
                </Card>
              )}
            </HudTop>
          </Hud>
        )}
      </PaintContext.Provider>
    </div>
  )
}

declare global {
  interface Window {
    whereabouts: { map: GameMap["map"]; gameMap: GameMap; paint: PaintController }
  }
}

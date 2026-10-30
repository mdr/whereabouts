/**
 * Mounts the MapLibre map once and hands a PaintController to children via
 * context. The map fills the screen; children are HUD overlays positioned on
 * top of it, plus the developer drawer when dev mode is on.
 */
import { createContext } from "preact"
import { useContext, useEffect, useState } from "preact/hooks"
import { useElementRef } from "./element-ref"
import type { ComponentChildren } from "preact"
import { GameMap } from "../map"
import { PaintController } from "../paint-controller"
import { THEME } from "../themes"
import { devMode } from "../dev"
import { effect } from "@preact/signals"
import { sound } from "../sound"
import { globeView, soundOn } from "../settings"
import { mapViewTestIds } from "./MapViewTestIds"

const PaintContext = createContext<PaintController | undefined>(undefined)

export function usePaint(): PaintController {
  const p = useContext(PaintContext)
  if (!p) throw new Error("usePaint outside MapView")
  return p
}

export function MapView({ children }: { children: ComponentChildren }) {
  const el = useElementRef<HTMLDivElement>()
  const [controller, setController] = useState<PaintController | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const gameMap = new GameMap(el.current!)
    let ctl: PaintController | undefined = undefined
    let retry: ReturnType<typeof setTimeout> | undefined = undefined
    gameMap.ready.then(
      () => {
        gameMap.applyTheme(THEME)
        // Anything that would give the location away stays hidden.
        gameMap.setDetail("minimal")
        gameMap.addGlobeButton(() => (globeView.value = !globeView.value), mapViewTestIds.globeButton)
        ctl = new PaintController(gameMap)
        window.whereabouts = { map: gameMap.map, gameMap, paint: ctl }
        setController(ctl)
      },
      (err: unknown) => {
        console.warn("could not load the map", err)
        // One quiet try before troubling the player.
        if (attempt === 0) retry = setTimeout(() => setAttempt(1), 2000)
        else setFailed(true)
      }
    )
    return () => {
      clearTimeout(retry)
      ctl?.dispose()
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
      sound.setStroke(tool === "paint" ? "spray" : tool === "erase" ? "eraser" : undefined)
    })
    return () => {
      stop()
      sound.setStroke(undefined)
    }
  }, [controller])

  // Belt and braces with touch-action in style.css: Safari ignores the
  // viewport's user-scalable, and cancelling its own gesture events is the
  // known way to stop it zooming the page on a pinch. Only while a map
  // screen is up; MapLibre and the photo lightbox read touch and pointer
  // events, which this leaves alone.
  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    const types = ["gesturestart", "gesturechange", "gestureend"]
    for (const t of types) document.addEventListener(t, block, { passive: false })
    return () => {
      for (const t of types) document.removeEventListener(t, block)
    }
  }, [])

  // The drawer takes a strip off the right, so the map must resize with it.
  const dev = devMode.value
  useEffect(() => {
    controller?.gameMap.map.resize()
  }, [dev, controller])

  return (
    <div class={`stage ${dev ? "dev" : ""}`}>
      <div id="map" ref={el} data-testid={mapViewTestIds.map} />
      <PaintContext.Provider value={controller}>
        {controller ? (
          children
        ) : (
          <div class="hud">
            <div class="hud-top">
              {failed ? (
                <div class="card" data-testid={mapViewTestIds.failed}>
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
                </div>
              ) : (
                <div class="card">
                  <p class="hint" data-testid={mapViewTestIds.loading}>
                    Loading map…
                  </p>
                </div>
              )}
            </div>
          </div>
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

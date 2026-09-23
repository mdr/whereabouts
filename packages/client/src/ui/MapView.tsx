/**
 * Mounts the MapLibre map once and hands a PaintController to children via
 * context. The map fills the screen; children are HUD overlays positioned on
 * top of it, plus the developer drawer when dev mode is on.
 */
import { createContext } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { GameMap } from "../map";
import { PaintController } from "../paint-controller";
import { THEME } from "../themes";
import { devMode } from "../dev";
import { effect } from "@preact/signals";
import { sound } from "../sound";
import { soundOn } from "../settings";

export const PaintContext = createContext<PaintController | null>(null);

export function usePaint(): PaintController {
  const p = useContext(PaintContext);
  if (!p) throw new Error("usePaint outside MapView");
  return p;
}

export function MapView({ children }: { children: ComponentChildren }) {
  const el = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<PaintController | null>(null);

  useEffect(() => {
    const gameMap = new GameMap(el.current!);
    let ctl: PaintController | null = null;
    void gameMap.ready.then(() => {
      gameMap.applyTheme(THEME);
      // Anything that would give the location away stays hidden.
      gameMap.setDetail("minimal");
      ctl = new PaintController(gameMap);
      window.whereabouts = { map: gameMap.map, gameMap, paint: ctl };
      setController(ctl);
    });
    return () => {
      ctl?.dispose();
      gameMap.dispose();
    };
  }, []);

  // The spray (or the eraser) plays while a stroke is held and painting is
  // allowed; it stops when the stroke ends, the round locks you out, or the
  // map goes.
  useEffect(() => {
    if (!controller) return;
    const stop = effect(() => {
      const tool = controller.enabled.value && soundOn.value ? controller.stroking.value : null;
      sound.setStroke(tool === "paint" ? "spray" : tool === "erase" ? "eraser" : null);
    });
    return () => {
      stop();
      sound.setStroke(null);
    };
  }, [controller]);

  // Belt and braces with touch-action in style.css: Safari ignores the
  // viewport's user-scalable, and cancelling its own gesture events is the
  // known way to stop it zooming the page on a pinch. Only while a map
  // screen is up; MapLibre and the photo lightbox read touch and pointer
  // events, which this leaves alone.
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const types = ["gesturestart", "gesturechange", "gestureend"];
    for (const t of types) document.addEventListener(t, block, { passive: false });
    return () => {
      for (const t of types) document.removeEventListener(t, block);
    };
  }, []);

  // The drawer takes a strip off the right, so the map must resize with it.
  const dev = devMode.value;
  useEffect(() => {
    controller?.gameMap.map.resize();
  }, [dev, controller]);

  return (
    <div class={`stage ${dev ? "dev" : ""}`}>
      <div id="map" ref={el} />
      <PaintContext.Provider value={controller}>
        {controller ? (
          children
        ) : (
          <div class="hud">
            <div class="hud-top">
              <div class="card">
                <p class="hint">Loading map…</p>
              </div>
            </div>
          </div>
        )}
      </PaintContext.Provider>
    </div>
  );
}

declare global {
  interface Window {
    whereabouts: { map: GameMap["map"]; gameMap: GameMap; paint: PaintController };
  }
}

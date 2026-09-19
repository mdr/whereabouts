/**
 * Mounts the MapLibre map once and hands a PaintController to children via
 * context. The map lives for the life of the screen that renders MapView.
 */
import { createContext } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { GameMap } from "../map";
import { PaintController } from "../paint-controller";
import { THEME } from "../themes";
import { showBorders, showDetail, showInlandWater, showLabels } from "../settings";
import { effect } from "@preact/signals";

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
    let disposeEffect: (() => void) | null = null;
    void gameMap.ready.then(() => {
      gameMap.applyTheme(THEME);
      disposeEffect = effect(() => {
        gameMap.setLabels(showLabels.value);
        gameMap.setBorders(showBorders.value);
        gameMap.setDetail(showDetail.value);
        gameMap.setInlandWater(showInlandWater.value);
      });
      ctl = new PaintController(gameMap);
      window.whereabouts = { map: gameMap.map, gameMap, paint: ctl };
      setController(ctl);
    });
    return () => {
      disposeEffect?.();
      ctl?.dispose();
      gameMap.map.remove();
    };
  }, []);

  return (
    <>
      <div id="map" ref={el} />
      <aside id="panel">
        <PaintContext.Provider value={controller}>
          {controller ? children : <p class="hint">Loading map…</p>}
        </PaintContext.Provider>
      </aside>
    </>
  );
}

declare global {
  interface Window {
    whereabouts: { map: GameMap["map"]; gameMap: GameMap; paint: PaintController };
  }
}

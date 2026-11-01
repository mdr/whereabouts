// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { Point, type LngLat } from "maplibre-gl"
import type { GameMap } from "../map/map"
import { PaintInput } from "./paint-input"
import type { PaintModel } from "./paint-model"
import type { PaintView } from "./paint-view"
import { Tool } from "./tool"

function setup() {
  const handlers = new Map<string, (event: unknown) => void>()
  const container = document.createElement("div")
  const map = {
    on: (name: string, fn: (event: unknown) => void) => handlers.set(name, fn),
    off: vi.fn(),
    getContainer: () => container,
    getCanvasContainer: () => container,
    dragPan: { enable: vi.fn(), disable: vi.fn() },
    unproject: (point: Point) => ({ lat: point.y, lng: point.x }) as LngLat
  }
  const gameMap = {
    map,
    onSurface: () => true,
    camera: { pixelsToKm: (px: number) => px / 1000 },
    setCursorFootprint: vi.fn()
  } as unknown as GameMap
  const stamp = vi.fn()
  const endStroke = vi.fn()
  const model = {
    fillable: { value: false, subscribe: () => () => undefined },
    layer: { stampCells: () => [] },
    beginStroke: vi.fn(),
    endStroke,
    stamp
  } as unknown as PaintModel
  const view = { queue: vi.fn(), cancel: vi.fn() } as unknown as PaintView
  const input = new PaintInput(gameMap, model, view)
  input.enabled.value = true
  const mouse = (name: string, x: number) =>
    handlers.get(name)!({
      point: new Point(x, 0),
      lngLat: { lat: 0, lng: x },
      originalEvent: { button: 0 }
    })
  return { input, stamp, endStroke, mouse }
}

describe("a paint stroke", () => {
  it("paints along a drag", () => {
    const { input, stamp, mouse } = setup()
    mouse("mousedown", 0)
    mouse("mousemove", 100)
    expect(stamp.mock.calls.length).toBeGreaterThan(1)
    input.dispose()
  })

  it("ends when the tool changes, so the new tool does not carry on the drag", () => {
    const { input, stamp, endStroke, mouse } = setup()
    mouse("mousedown", 0)
    stamp.mockClear()
    input.tool.value = Tool.ERASE
    mouse("mousemove", 100)
    expect(endStroke).toHaveBeenCalled()
    expect(stamp).not.toHaveBeenCalled()
    input.dispose()
  })
})

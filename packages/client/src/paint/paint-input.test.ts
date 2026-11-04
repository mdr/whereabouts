// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi, type Mock } from "vite-plus/test"
import { signal } from "@preact/signals"
import { Point, type LngLat } from "maplibre-gl"
import type { GameMap } from "../map/map"
import { PaintInput } from "./paint-input"
import type { PaintModel } from "./paint-model"
import type { PaintView } from "./paint-view"
import { Tool } from "./tool"

interface Harness {
  input: PaintInput
  stamp: Mock
  endStroke: Mock
  abandonStroke: Mock
  fillAt: Mock
  cancel: Mock
  fillable: { value: boolean }
  container: HTMLElement
  mouse: (name: string, x: number) => void
  touch: (name: string, x: number, fingers: number) => void
}

let input: PaintInput | undefined = undefined

const setup = (): Harness => {
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
    setCursorFootprint: vi.fn(),
    setCursorShape: vi.fn()
  } as unknown as GameMap
  const stamp = vi.fn()
  const endStroke = vi.fn()
  const abandonStroke = vi.fn()
  const fillAt = vi.fn()
  const fillable = signal(false)
  const model = {
    fillable,
    layer: { stampCells: () => [] },
    targetAt: () => undefined,
    beginStroke: vi.fn(),
    endStroke,
    abandonStroke,
    fillAt,
    stamp
  } as unknown as PaintModel
  const cancel = vi.fn()
  const view = { queue: vi.fn(), cancel } as unknown as PaintView
  input = new PaintInput(gameMap, model, view)
  input.enabled.value = true
  const mouse = (name: string, x: number): void =>
    handlers.get(name)!({
      point: new Point(x, 0),
      lngLat: { lat: 0, lng: x },
      originalEvent: { button: 0 }
    })
  const touch = (name: string, x: number, fingers: number): void =>
    handlers.get(name)!({
      point: new Point(x, 0),
      points: Array.from({ length: fingers }, () => new Point(x, 0)),
      preventDefault: vi.fn()
    })
  return { input, stamp, endStroke, abandonStroke, fillAt, cancel, fillable, container, mouse, touch }
}

const space = (type: "keydown" | "keyup"): void => {
  window.dispatchEvent(new KeyboardEvent(type, { code: "Space", key: " " }))
}

afterEach(() => {
  input?.dispose()
  input = undefined
})

describe("a paint stroke", () => {
  it("paints along a drag", () => {
    const { stamp, mouse } = setup()
    mouse("mousedown", 0)
    mouse("mousemove", 100)
    expect(stamp.mock.calls.length).toBeGreaterThan(1)
  })

  it("ends when the tool changes, so the new tool does not carry on the drag", () => {
    const { input, stamp, endStroke, mouse } = setup()
    mouse("mousedown", 0)
    stamp.mockClear()
    input.tool.value = Tool.ERASE
    mouse("mousemove", 100)
    expect(endStroke).toHaveBeenCalled()
    expect(stamp).not.toHaveBeenCalled()
  })

  it("paints at the chosen strength, and the eraser takes paint off", () => {
    const { input, stamp, mouse } = setup()
    input.strength.value = 0.5
    mouse("mousedown", 0)
    expect(stamp.mock.calls[0]![2]).toBeCloseTo(0.15)
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }))
    input.tool.value = Tool.ERASE
    mouse("mousedown", 0)
    expect(stamp.mock.calls.at(-1)![2]).toBeCloseTo(-0.15)
  })

  it("stops when painting is switched off mid-stroke, keeping a queued draw off the next screen", () => {
    const { input, stamp, endStroke, cancel, mouse } = setup()
    mouse("mousedown", 0)
    stamp.mockClear()
    input.enabled.value = false
    expect(endStroke).toHaveBeenCalled()
    expect(cancel).toHaveBeenCalled()
    mouse("mousemove", 100)
    mouse("mousedown", 100)
    expect(stamp).not.toHaveBeenCalled()
  })

  it("pans instead while Space is held, painting again once it is let go", () => {
    const { stamp, endStroke, container, mouse } = setup()
    mouse("mousedown", 0)
    stamp.mockClear()
    space("keydown")
    expect(endStroke).toHaveBeenCalled()
    expect(container.dataset["tool"]).toBeUndefined()
    mouse("mousemove", 100)
    mouse("mousedown", 100)
    expect(stamp).not.toHaveBeenCalled()
    space("keyup")
    expect(container.dataset["tool"]).toBe(Tool.PAINT)
    mouse("mousedown", 100)
    expect(stamp).toHaveBeenCalled()
  })

  it("takes a one-finger stroke back when a second finger makes it a pinch", () => {
    const { stamp, abandonStroke, touch } = setup()
    touch("touchstart", 0, 1)
    touch("touchmove", 50, 1)
    expect(stamp).toHaveBeenCalled()
    stamp.mockClear()
    touch("touchmove", 60, 2)
    expect(abandonStroke).toHaveBeenCalledTimes(1)
    touch("touchmove", 100, 1)
    expect(stamp).not.toHaveBeenCalled()
  })

  it("does not paint with the pan tool", () => {
    const { input, stamp, mouse } = setup()
    input.tool.value = Tool.PAN
    mouse("mousedown", 0)
    mouse("mousemove", 100)
    expect(stamp).not.toHaveBeenCalled()
  })
})

describe("the Fill tool", () => {
  it("fills on a click, never by dragging", () => {
    const { input, stamp, fillAt, fillable, mouse } = setup()
    fillable.value = true
    input.tool.value = Tool.FILL
    mouse("mousedown", 0)
    mouse("mousemove", 100)
    expect(stamp).not.toHaveBeenCalled()
    mouse("click", 30)
    expect(fillAt).toHaveBeenCalledWith({ lat: 0, lon: 30 }, expect.any(Number))
  })

  it("does nothing on a click with the brush", () => {
    const { fillAt, fillable, mouse } = setup()
    fillable.value = true
    mouse("click", 30)
    expect(fillAt).not.toHaveBeenCalled()
  })

  it("hands back the brush when a round offers no fill", () => {
    const { input, fillable } = setup()
    fillable.value = true
    input.tool.value = Tool.FILL
    fillable.value = false
    expect(input.tool.value).toBe(Tool.PAINT)
  })
})

describe("the brush size", () => {
  it("stays between 6 and 200 px, in whole pixels", () => {
    const { input } = setup()
    input.setBrushSize(2)
    expect(input.brushRadius.value).toBe(6)
    input.setBrushSize(500)
    expect(input.brushRadius.value).toBe(200)
    input.setBrushSize(41.6)
    expect(input.brushRadius.value).toBe(42)
  })
})

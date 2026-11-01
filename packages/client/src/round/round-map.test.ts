// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { renderHook } from "@testing-library/preact"
import { signal } from "@preact/signals"
import { HintAxis, type HintBand } from "@whereabouts/shared/hints"
import { MapDetail, type QuestionView } from "@whereabouts/shared/protocol"
import { QuestionType } from "@whereabouts/shared/questions"
import { useFillTool } from "../paint/fill"
import { useRoundMap, type RoundPaint } from "./round"
import { startOnPan } from "../settings/settings"
import { RevealDetail } from "../map/shown-detail"
import { areaAnswerView, makeQuestionView } from "../test-view"
import { Tool } from "../paint/tool"

vi.mock("../paint/fill", () => ({ useFillTool: vi.fn() }))

function makePaint() {
  return {
    reset: vi.fn(),
    tool: signal(Tool.PAN),
    useFiller: vi.fn(),
    offerFill: vi.fn(),
    gameMap: {
      clearReveal: vi.fn(),
      resetView: vi.fn(),
      setDetail: vi.fn(),
      setStateReveal: vi.fn(),
      setHint: vi.fn()
    }
  } satisfies RoundPaint
}

interface Props {
  round: number
  painting: boolean
  question: QuestionView
  detail: MapDetail
  reveal: boolean
  hint?: HintBand
}

function setup(over: Partial<Props> = {}) {
  const paint = makePaint()
  const start = vi.fn()
  let props: Props = {
    round: 0,
    painting: true,
    question: makeQuestionView(),
    detail: MapDetail.POLITICAL,
    reveal: false,
    ...over
  }
  const hook = renderHook((hookProps: Props) => useRoundMap(paint, { ...hookProps, hint: hookProps.hint, start }), {
    initialProps: props
  })
  const update = (change: Partial<Props>) => {
    props = { ...props, ...change }
    hook.rerender(props)
  }
  return { paint, start, hook, update }
}

const country = makeQuestionView({ type: QuestionType.COUNTRY, answer: areaAnswerView("peru") })

afterEach(() => {
  startOnPan.value = false
  vi.mocked(useFillTool).mockClear()
})

describe("useRoundMap", () => {
  it("starts a round afresh: paint reset to its tolerance, then the screen's start, the map cleared, the brush picked", () => {
    const { paint, start } = setup()
    expect(paint.reset).toHaveBeenCalledWith(50)
    expect(start).toHaveBeenCalledTimes(1)
    expect(paint.reset.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]!)
    expect(paint.gameMap.clearReveal).toHaveBeenCalled()
    expect(paint.gameMap.resetView).toHaveBeenCalled()
    expect(paint.tool.value).toBe(Tool.PAINT)
  })

  it("keeps the paint through a fresh copy of the same round's question", () => {
    const { paint, update } = setup()
    update({ question: makeQuestionView() })
    expect(paint.reset).toHaveBeenCalledTimes(1)
  })

  it("starts again for the next round, but not for its reveal", () => {
    const { paint, update } = setup()
    update({ painting: false, reveal: true })
    expect(paint.reset).toHaveBeenCalledTimes(1)
    update({ round: 1, painting: true, reveal: false })
    expect(paint.reset).toHaveBeenCalledTimes(2)
  })

  it("starts on the pan tool for a player who chose that", () => {
    startOnPan.value = true
    expect(setup().paint.tool.value).toBe(Tool.PAN)
  })

  it("offers the Fill tool for a country on a map with borders, and only there", () => {
    const offered = (over: Partial<Props>) => {
      vi.mocked(useFillTool).mockClear()
      setup(over).hook.unmount()
      return vi.mocked(useFillTool).mock.calls.at(-1)?.[1]
    }
    expect(offered({ question: country })).toBe(true)
    expect(offered({ question: country, detail: MapDetail.PHYSICAL })).toBe(false)
    expect(offered({})).toBe(false)
  })

  it("shows everything at the reveal, and a state round's states", () => {
    const state = makeQuestionView({ type: QuestionType.STATE, answer: areaAnswerView("state-texas") })
    const { paint, update } = setup({ question: state, detail: MapDetail.WATER })
    expect(paint.gameMap.setDetail).toHaveBeenLastCalledWith(MapDetail.WATER)
    expect(paint.gameMap.setStateReveal).toHaveBeenLastCalledWith(false)
    update({ painting: false, reveal: true })
    expect(paint.gameMap.setDetail).toHaveBeenLastCalledWith(RevealDetail.REVEAL)
    expect(paint.gameMap.setStateReveal).toHaveBeenLastCalledWith(true)
  })

  it("shades the hint's band, and takes it off when the round's map goes", () => {
    const band: HintBand = { axis: HintAxis.LATITUDE, from: 10, to: 20 }
    const { paint, update, hook } = setup()
    update({ hint: band })
    expect(paint.gameMap.setHint).toHaveBeenLastCalledWith(band)
    hook.unmount()
    expect(paint.gameMap.setHint).toHaveBeenLastCalledWith(undefined)
  })
})

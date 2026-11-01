import { AnswerType } from "../questions.ts"
import { describe, expect, it } from "vite-plus/test"
import { PaintLayer } from "../paint/paint.ts"
import { CaseQuestionType, decodeCase, encodeCase, type ScoringCase } from "./scoring-case.ts"
import { h3Resolution } from "../h3.ts"
import { flagCode, questionId } from "../ids.ts"
import { KernelId } from "./scoring.ts"

function sample(): ScoringCase {
  const layer = new PaintLayer(h3Resolution(6))
  layer.stamp({ lat: 48.86, lon: 2.35 }, 80, 1)
  layer.stamp({ lat: 48.9, lon: 2.5 }, 30, 0.6)
  layer.stamp({ lat: 51.5, lon: -0.12 }, 400, 0.3)
  return {
    question: {
      type: CaseQuestionType.PHOTO,
      id: questionId("eiffel-tower"),
      label: 'The "Iron Lady", Paris',
      answer: { lat: 48.8584, lon: 2.2945 },
      tolerance: 25
    },
    kernel: KernelId.MULTI_EQUAL,
    floor: 0.05,
    resolution: layer.resolution,
    score: 412.3,
    parts: { type: AnswerType.POINT, A: 0.5312, B: 0.6501 },
    cells: layer.toRecord()
  }
}

describe("scoring cases", () => {
  it("round-trip the question, scoring and paint", async () => {
    const scoringCase = sample()
    const back = await decodeCase(await encodeCase(scoringCase))
    expect(back.question).toEqual(scoringCase.question)
    expect([back.kernel, back.floor, back.resolution, back.score, back.parts]).toEqual([
      scoringCase.kernel,
      scoringCase.floor,
      scoringCase.resolution,
      scoringCase.score,
      scoringCase.parts
    ])
    expect(Object.keys(back.cells).sort()).toEqual(Object.keys(scoringCase.cells).sort())
    const max = Math.max(...Object.values(scoringCase.cells))
    for (const [cell, value] of Object.entries(scoringCase.cells))
      expect(Math.abs(back.cells[cell]! - value)).toBeLessThan(max * 1e-4)
  })

  it("keep a country round's parts and flag", async () => {
    const scoringCase: ScoringCase = {
      ...sample(),
      question: {
        type: CaseQuestionType.REGION,
        id: questionId("germany-region"),
        label: "Germany",
        answer: { lat: 51.1, lon: 10.4 },
        tolerance: 77.3,
        flag: flagCode("de")
      },
      parts: { type: AnswerType.AREA, shape: 640.2, nearness: 300.5 }
    }
    const back = await decodeCase(await encodeCase(scoringCase))
    expect(back.question).toEqual(scoringCase.question)
    expect(back.parts).toEqual(scoringCase.parts)
  })

  it("read cases copied before their words were upper case", async () => {
    const text = (await encodeCase(sample()))
      .replace("question: PHOTO", "question: photo")
      .replace("kernel: MULTI_EQUAL", "kernel: multi-equal")
    const back = await decodeCase(text)
    expect([back.question.type, back.kernel]).toEqual([CaseQuestionType.PHOTO, KernelId.MULTI_EQUAL])
  })

  it("survive chat around it, indentation and rewrapping", async () => {
    const text = await encodeCase(sample())
    const [header, payload] = [text.split("\n").slice(0, 6), text.split("\n").slice(6, -1).join("")]
    const mangled = [
      "Here's one where the wide blob scores oddly:",
      "",
      ...header.map((line) => `  ${line}  `),
      ...(payload.match(/.{1,31}/g) ?? []).map((line) => `    ${line}`),
      "",
      "  end",
      "What do you think?"
    ].join("\r\n")
    expect((await decodeCase(mangled)).cells).toEqual((await decodeCase(text)).cells)
  })

  it("say so when the paste was cut short", async () => {
    const text = await encodeCase(sample())
    await expect(decodeCase(text.slice(0, text.lastIndexOf("\n")))).rejects.toThrow(/cut off/)
  })
})

import { describe, expect, it } from "vitest"
import { PaintLayer } from "./paint.ts"
import { decodeCase, encodeCase, type ScoringCase } from "./scoring-case.ts"

function sample(): ScoringCase {
  const layer = new PaintLayer(6)
  layer.stamp({ lat: 48.86, lon: 2.35 }, 80, 1)
  layer.stamp({ lat: 48.9, lon: 2.5 }, 30, 0.6)
  layer.stamp({ lat: 51.5, lon: -0.12 }, 400, 0.3)
  return {
    question: {
      kind: "photo",
      id: "eiffel-tower",
      label: 'The "Iron Lady", Paris',
      answer: { lat: 48.8584, lon: 2.2945 },
      toleranceKm: 25
    },
    kernel: "multi-equal",
    floor: 0.05,
    res: layer.res,
    score: 412.3,
    parts: { A: 0.5312, B: 0.6501 },
    cells: layer.toRecord()
  }
}

describe("scoring cases", () => {
  it("round-trip the question, scoring and paint", async () => {
    const c = sample()
    const back = await decodeCase(await encodeCase(c))
    expect(back.question).toEqual(c.question)
    expect([back.kernel, back.floor, back.res, back.score, back.parts]).toEqual([
      c.kernel,
      c.floor,
      c.res,
      c.score,
      c.parts
    ])
    expect(Object.keys(back.cells).sort()).toEqual(Object.keys(c.cells).sort())
    const max = Math.max(...Object.values(c.cells))
    for (const [h, v] of Object.entries(c.cells)) expect(Math.abs(back.cells[h]! - v)).toBeLessThan(max * 1e-4)
  })

  it("keep a country round's parts and flag", async () => {
    const c: ScoringCase = {
      ...sample(),
      question: {
        kind: "region",
        id: "DEU",
        label: "Germany",
        answer: { lat: 51.1, lon: 10.4 },
        toleranceKm: 77.3,
        flag: "de"
      },
      parts: { shape: 640.2, nearness: 300.5 }
    }
    const back = await decodeCase(await encodeCase(c))
    expect(back.question).toEqual(c.question)
    expect(back.parts).toEqual(c.parts)
  })

  it("survive chat around it, indentation and rewrapping", async () => {
    const text = await encodeCase(sample())
    const [header, payload] = [text.split("\n").slice(0, 6), text.split("\n").slice(6, -1).join("")]
    const mangled = [
      "Here's one where the wide blob scores oddly:",
      "",
      ...header.map((l) => `  ${l}  `),
      ...(payload.match(/.{1,31}/g) ?? []).map((l) => `    ${l}`),
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

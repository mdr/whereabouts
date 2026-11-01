import { describe, expect, it } from "vite-plus/test"
import { RoundNote } from "./round-model"
import { noteText, readyCountText, roundScoreText } from "./round-words"
import { makeResult } from "../test-view"

const words = { askedToWatch: true, canUnlock: true }

describe("round words", () => {
  it("say why you are watching", () => {
    expect(noteText(RoundNote.WATCHING, words)).toMatch(/^You're watching this game/)
    expect(noteText(RoundNote.WATCHING, { ...words, askedToWatch: false })).toMatch(/^The game was full/)
  })

  it("offer Keep editing only while you still can", () => {
    expect(noteText(RoundNote.DONE, words)).toMatch(/Changed your mind\? Keep editing\.$/)
    expect(noteText(RoundNote.DONE, { ...words, canUnlock: false })).not.toMatch(/Keep editing/)
  })

  it("count who is ready", () => {
    expect(readyCountText(1, 2)).toBe("1 of 2 ready")
  })

  it("show a pass's score like any other round's", () => {
    expect(roundScoreText(makeResult({ score: 250 }))).toBe("+250")
    expect(roundScoreText(undefined)).toBe("sat out")
  })
})

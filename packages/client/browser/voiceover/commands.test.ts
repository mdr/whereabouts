import { describe, expect, it } from "vite-plus/test"
import { CommandType, parseCommand, parseScript } from "./commands.ts"

describe("parseCommand", () => {
  it("moves once, or the number of times given", () => {
    expect(parseCommand("next")).toEqual({ type: CommandType.NEXT, times: 1 })
    expect(parseCommand("  previous 3 ")).toEqual({ type: CommandType.PREVIOUS, times: 3 })
  })

  it("refuses a count that isn't a positive whole number", () => {
    expect(parseCommand("next 0")).toBeUndefined()
    expect(parseCommand("next two")).toBeUndefined()
    expect(parseCommand("next 1.5")).toBeUndefined()
  })

  it("presses each key given, in turn", () => {
    expect(parseCommand("press Tab Shift+Tab")).toEqual({ type: CommandType.PRESS, keys: ["Tab", "Shift+Tab"] })
    expect(parseCommand("press")).toBeUndefined()
  })

  it("types the rest of the line, spaces and all", () => {
    expect(parseCommand("type Alice  Smith")).toEqual({ type: CommandType.TYPE, text: "Alice  Smith" })
    expect(parseCommand("type")).toBeUndefined()
  })

  it("opens only a route", () => {
    expect(parseCommand("open /solo")).toEqual({ type: CommandType.OPEN, route: "/solo" })
    expect(parseCommand("open solo")).toBeUndefined()
  })

  it("seats the names given", () => {
    expect(parseCommand("seat Bob Cara")).toEqual({ type: CommandType.SEAT, names: ["Bob", "Cara"] })
  })

  it("ignores case, and lines that ask for nothing it knows", () => {
    expect(parseCommand("ACT")).toEqual({ type: CommandType.ACT })
    expect(parseCommand("")).toBeUndefined()
    expect(parseCommand("dance")).toBeUndefined()
  })
})

describe("parseScript", () => {
  it("reads each line, skipping blanks and comments", () => {
    expect(parseScript("# from Home\nnext 2\n\n  act\n")).toEqual([
      { line: "next 2", command: { type: CommandType.NEXT, times: 2 } },
      { line: "act", command: { type: CommandType.ACT } }
    ])
  })

  it("names every line it can't read", () => {
    expect(() => parseScript("next\ndance\nopen solo")).toThrow(/dance\n {2}open solo/)
  })
})

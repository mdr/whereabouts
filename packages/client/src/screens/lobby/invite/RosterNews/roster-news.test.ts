import { describe, expect, it } from "vite-plus/test"
import { playerId, playerName, type PlayerId } from "@whereabouts/shared/ids"
import { rosterNews, type Seat } from "./roster-news"

const IDS: Record<string, string> = { Alice: "p1", Bob: "p2", Cara: "p3", Dev: "p4", Hana: "p5" }
const idOf = (name: string): PlayerId => playerId(IDS[name]!)
const seat = (name: string, isHost = false): Seat => ({ id: idOf(name), name: playerName(name), isHost })
const alice = seat("Alice", true)
const you = alice.id

describe("rosterNews", () => {
  it("says nothing when no one came, went or took over", () => {
    expect(rosterNews([alice, seat("Bob")], [alice, seat("Bob")], you)).toBeUndefined()
  })

  it("names who joined, together", () => {
    expect(rosterNews([alice], [alice, seat("Bob")], you)).toBe("Bob joined.")
    expect(rosterNews([alice], [alice, seat("Bob"), seat("Cara"), seat("Dev")], you)).toBe("Bob, Cara and Dev joined.")
  })

  it("never tells you that you joined", () => {
    expect(rosterNews([seat("Hana", true)], [seat("Hana", true), seat("Alice")], idOf("Alice"))).toBeUndefined()
  })

  it("names who left", () => {
    expect(rosterNews([alice, seat("Bob"), seat("Cara")], [alice], you)).toBe("Bob and Cara left.")
  })

  it("says who hosts now, or that you do", () => {
    const hana = seat("Hana", true)
    expect(rosterNews([hana, seat("Alice")], [seat("Hana"), seat("Alice", true)], idOf("Alice"))).toBe(
      "You're the host now."
    )
    expect(rosterNews([alice, seat("Bob")], [seat("Alice"), seat("Bob", true)], you)).toBe("Bob is now the host.")
  })

  it("tells of a host who left and their successor in one", () => {
    expect(rosterNews([seat("Hana", true), seat("Alice")], [seat("Alice", true)], idOf("Alice"))).toBe(
      "Hana left. You're the host now."
    )
  })

  it("ignores a rename", () => {
    expect(
      rosterNews([alice, seat("Bob")], [alice, { ...seat("Bob"), name: playerName("Bobby") }], you)
    ).toBeUndefined()
  })
})

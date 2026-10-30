// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { CLOSE_REASONS } from "@whereabouts/shared/close-reason"
import { describeDisconnect } from "./net"

describe("describeDisconnect", () => {
  it("words every reason the server can give", () => {
    for (const reason of CLOSE_REASONS) expect(describeDisconnect(4001, reason).title).not.toBe("Disconnected")
  })

  it("explains a destroyed room in player terms", () => {
    const r = describeDisconnect(1000, "room_destroyed")
    expect(r.title).toBe("That game has ended")
    expect(r.detail).toContain("Everyone left")
  })

  it("offers hosting under a missing code, and forgets the seat of a removed player", () => {
    expect(describeDisconnect(4001, "noSuchGame")).toMatchObject({ title: "No game with that code", missing: true })
    expect(describeDisconnect(1000, "full").missing).toBeUndefined()
    expect(describeDisconnect(1000, "removed")).toMatchObject({
      title: "You were removed from the game",
      removed: true
    })
    expect(describeDisconnect(1000, "full").detail).toContain("16 players and 8 people watching")
    expect(describeDisconnect(0, "reconnect_failed").title).toBe("Lost the connection")
  })

  it("falls back to the raw reason or the close code", () => {
    expect(describeDisconnect(1006, undefined).detail).toContain("1006")
    expect(describeDisconnect(1000, "something odd").detail).toBe("something odd")
  })
})

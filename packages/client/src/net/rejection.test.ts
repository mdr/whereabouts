import { describe, expect, it } from "vite-plus/test"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { RejectionAction, describeDisconnect } from "./rejection"

describe("describeDisconnect", () => {
  it("words every reason the server can give", () => {
    for (const reason of Object.values(CloseReason))
      expect(describeDisconnect(4001, reason).title).not.toBe("Disconnected")
  })

  it("explains a destroyed room in player terms", () => {
    const description = describeDisconnect(1000, "room_destroyed")
    expect(description.title).toBe("That game has ended")
    expect(description.detail).toContain("Everyone left")
  })

  it("offers hosting under a missing code, and forgets the seat of a removed player", () => {
    expect(describeDisconnect(4001, CloseReason.NO_SUCH_GAME)).toMatchObject({
      title: "No game with that code",
      action: RejectionAction.HOST_UNDER_CODE
    })
    expect(describeDisconnect(1000, CloseReason.FULL).action).toBe(RejectionAction.NONE)
    expect(describeDisconnect(1000, CloseReason.REMOVED)).toMatchObject({
      title: "You were removed from the game",
      action: RejectionAction.FORGET_SEAT
    })
    expect(describeDisconnect(1000, CloseReason.FULL).detail).toContain("24 players and 24 people watching")
    expect(describeDisconnect(0, "reconnect_failed").title).toBe("Lost the connection")
  })

  it("falls back to the raw reason or the close code", () => {
    expect(describeDisconnect(1006, undefined).detail).toContain("1006")
    expect(describeDisconnect(1000, "something odd").detail).toBe("something odd")
  })
})

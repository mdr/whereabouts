import { describe, expect, it } from "vite-plus/test"
import { endGameRequest, kickRequest, leaveRequest, makeHostRequest } from "./confirm-requests"

const noop = (): void => {}

describe("confirm requests", () => {
  it("words removing a player as a red confirm", () => {
    const request = kickRequest("Bob", noop)
    expect(request.title).toBe("Remove Bob from the game?")
    expect(request.body).toContain("rejoin with the code")
    expect(request.confirmLabel).toBe("Remove Bob")
    expect(request.safe).toBeUndefined()
  })

  it("words handing over as a plain confirm", () => {
    const request = makeHostRequest("Bob", noop)
    expect(request.title).toBe("Make Bob the host?")
    expect(request.confirmLabel).toBe("Make Bob host")
    expect(request.safe).toBe(true)
  })

  it("words ending the game as a red confirm", () => {
    const request = endGameRequest(noop)
    expect(request.title).toBe("End the game now?")
    expect(request.confirmLabel).toBe("End game")
    expect(request.safe).toBeUndefined()
  })

  it("names who becomes host when the host leaves, as a plain confirm", () => {
    const request = leaveRequest("Bob", noop)
    expect(request.title).toBe("Leave the game?")
    expect(request.body).toBe("Bob becomes the host.")
    expect(request.confirmLabel).toBe("Leave")
    expect(request.safe).toBe(true)
  })

  it("warns that the game closes when a lone host leaves, as a red confirm", () => {
    const request = leaveRequest(undefined, noop)
    expect(request.body).toBe("It closes, since no one else is here.")
    expect(request.confirmLabel).toBe("Leave and close")
    expect(request.safe).toBeUndefined()
  })

  it("runs the action it was given on confirm", () => {
    let confirmed = 0
    kickRequest("Bob", () => confirmed++).onConfirm()
    expect(confirmed).toBe(1)
  })
})

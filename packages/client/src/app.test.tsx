// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { render } from "@testing-library/preact"
import { useEffect } from "preact/hooks"
import { App } from "./app"
import { navigate } from "./router"

const mounts = vi.hoisted(() => ({ count: 0 }))
vi.mock("./screens/multiplayer/Multiplayer", () => ({
  Multiplayer: () => {
    useEffect(() => {
      mounts.count++
    }, [])
    return undefined
  }
}))

describe("App", () => {
  it("starts a game afresh on hosting a new one, even from a game begun at #/game/new", async () => {
    navigate("/game/new")
    render(<App />)
    expect(mounts.count).toBe(1)
    // The server's code goes into the URL without changing the route.
    history.replaceState(undefined, "", "#/game/WXYZ")
    navigate("/game/new")
    await new Promise((resolve) => setTimeout(resolve))
    expect(mounts.count).toBe(2)
  })
})

// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { renderHook, waitFor } from "@testing-library/preact"
import { outlineId } from "@whereabouts/shared/ids"

const SQUARE = [
  [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0]
    ]
  ]
]
const fetchBuildJson = vi.fn(() => Promise.resolve({ square: SQUARE }))
vi.mock("../net/stale-build", () => ({ fetchBuildJson }))

const { useOutline, useOutlines } = await import("./outlines")

describe("useOutlines", () => {
  it("fetches nothing until they are wanted, then gives them", async () => {
    const hook = renderHook(({ wanted }: { wanted: boolean }) => useOutlines(wanted), {
      initialProps: { wanted: false }
    })
    expect(fetchBuildJson).not.toHaveBeenCalled()
    expect(hook.result.current).toBeUndefined()

    hook.rerender({ wanted: true })
    await waitFor(() => expect(hook.result.current?.get(outlineId("square"))).toEqual(SQUARE))
    expect(fetchBuildJson).toHaveBeenCalledTimes(1)
  })

  it("gives one outline by id", () => {
    const hook = renderHook(() => useOutline(outlineId("square")))
    expect(hook.result.current).toEqual(SQUARE)
  })
})

import { describe, expect, it, vi } from "vite-plus/test"
import { withRetries } from "./retry"

describe("withRetries", () => {
  it("tries again after each delay, and gives up with the last error", async () => {
    let calls = 0
    const failing = () => {
      calls++
      return Promise.reject(new Error(`try ${calls}`))
    }
    await expect(withRetries(failing, [0, 0])).rejects.toThrow("try 3")
    expect(calls).toBe(3)
  })

  it("stops at the first success", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("dropped")).mockResolvedValue("ok")
    await expect(withRetries(load, [0, 0])).resolves.toBe("ok")
    expect(load).toHaveBeenCalledTimes(2)
  })
})

import { describe, expect, it, vi } from "vite-plus/test"
import { once } from "./load-once"

describe("once", () => {
  it("loads on the first call only, every caller sharing its result", async () => {
    const load = vi.fn(() => Promise.resolve("data"))
    const get = once(load)
    expect(load).not.toHaveBeenCalled()
    expect(await Promise.all([get(), get()])).toEqual(["data", "data"])
    expect(await get()).toBe("data")
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("tries again after a failure, then keeps what it got", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("dropped")).mockResolvedValue("data")
    const get = once(load)
    await expect(get()).rejects.toThrow("dropped")
    expect(await get()).toBe("data")
    expect(await get()).toBe("data")
    expect(load).toHaveBeenCalledTimes(2)
  })
})

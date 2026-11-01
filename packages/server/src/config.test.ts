import { describe, expect, it } from "vite-plus/test"
import { KernelId } from "@whereabouts/shared/scoring/scoring"
import { evenMix } from "@whereabouts/shared/protocol/config"
import { configFromEnv } from "./config.ts"

describe("configFromEnv", () => {
  it("uses defaults when nothing is set", () => {
    const config = configFromEnv({}, "/srv/client")
    expect(config).toEqual({
      port: 8787,
      host: "0.0.0.0",
      staticDir: "/srv/client",
      game: {},
      addressLimits: undefined
    })
  })

  it("reads overrides and ignores junk", () => {
    const config = configFromEnv(
      { PORT: "3000", HOST: "127.0.0.1", ROUNDS: "3", ROUND_MS: "15000", KERNEL: KernelId.SINGLE },
      "/srv/client"
    )
    expect(config.port).toBe(3000)
    expect(config.host).toBe("127.0.0.1")
    expect(config.game).toEqual({ mix: evenMix(3), roundLength: 15000, kernelId: KernelId.SINGLE })
  })

  it("rejects non-positive and fractional numbers", () => {
    const config = configFromEnv({ ROUNDS: "0", ROUND_MS: "-5", PORT: "x" }, "/x")
    expect(config.game).toEqual({})
    expect(config.port).toBe(8787)
  })

  it("takes a kernel by its old name too", () => {
    expect(configFromEnv({ KERNEL: "multi-equal" }, "/x").game.kernelId).toBe(KernelId.MULTI_EQUAL)
  })

  it("refuses an unknown kernel", () => {
    expect(() => configFromEnv({ KERNEL: "singel" }, "/x")).toThrow(/KERNEL must be one of SINGLE/)
  })

  it("empty STATIC_DIR disables static serving", () => {
    expect(configFromEnv({ STATIC_DIR: "" }, "/x").staticDir).toBeUndefined()
    expect(configFromEnv({ STATIC_DIR: "/custom" }, "/x").staticDir).toBe("/custom")
  })

  it("lets tests raise the connections allowed from one address", () => {
    expect(configFromEnv({ CONNECTIONS_PER_ADDRESS: "500" }, "/x").addressLimits).toEqual({
      maxOpen: 500,
      burst: 500,
      perSecond: 500
    })
  })
})

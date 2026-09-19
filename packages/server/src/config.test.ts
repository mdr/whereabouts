import { describe, expect, it } from "vitest";
import { configFromEnv } from "./config.ts";

describe("configFromEnv", () => {
  it("uses defaults when nothing is set", () => {
    const c = configFromEnv({}, "/srv/client");
    expect(c).toEqual({ port: 8787, host: "0.0.0.0", staticDir: "/srv/client", game: {} });
  });

  it("reads overrides and ignores junk", () => {
    const c = configFromEnv(
      { PORT: "3000", HOST: "127.0.0.1", ROUNDS: "3", ROUND_MS: "15000", KERNEL: "single" },
      "/srv/client",
    );
    expect(c.port).toBe(3000);
    expect(c.host).toBe("127.0.0.1");
    expect(c.game).toEqual({ rounds: 3, roundMs: 15000, kernelId: "single" });
  });

  it("rejects non-positive and fractional numbers", () => {
    const c = configFromEnv({ ROUNDS: "0", ROUND_MS: "-5", PORT: "x" }, "/x");
    expect(c.game).toEqual({});
    expect(c.port).toBe(8787);
  });

  it("empty STATIC_DIR disables static serving", () => {
    expect(configFromEnv({ STATIC_DIR: "" }, "/x").staticDir).toBeNull();
    expect(configFromEnv({ STATIC_DIR: "/custom" }, "/x").staticDir).toBe("/custom");
  });
});

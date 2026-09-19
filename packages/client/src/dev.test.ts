// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { hasDevFlag } from "./dev";

describe("hasDevFlag", () => {
  it("reads dev from the page query or the hash query", () => {
    expect(hasDevFlag({ search: "?dev", hash: "#/solo" })).toBe(true);
    expect(hasDevFlag({ search: "?dev=1&x=2", hash: "" })).toBe(true);
    expect(hasDevFlag({ search: "", hash: "#/solo?dev" })).toBe(true);
    expect(hasDevFlag({ search: "", hash: "#/game/AB12?foo=1&dev" })).toBe(true);
  });

  it("is off otherwise", () => {
    expect(hasDevFlag({ search: "", hash: "#/solo" })).toBe(false);
    expect(hasDevFlag({ search: "?developer", hash: "" })).toBe(false);
    expect(hasDevFlag({ search: "", hash: "#/devices" })).toBe(false);
  });
});

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { navigate, parseRoute, route } from "./router";

describe("parseRoute", () => {
  it("parses game codes case-insensitively and rejects bad ones", () => {
    expect(parseRoute("#/game/ab12")).toEqual({ name: "game", code: "AB12", create: false });
    expect(parseRoute("#/game/ABCDEF")).toEqual({ name: "game", code: "ABCDEF", create: false });
    expect(parseRoute("#/game/toolongcode")).toEqual({ name: "home" });
    expect(parseRoute("#/game/ab")).toEqual({ name: "home" });
  });

  it("recognises solo, new-game and home", () => {
    expect(parseRoute("#/solo")).toEqual({ name: "solo" });
    expect(parseRoute("#/game/new")).toEqual({ name: "game", code: "", create: true });
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/nowhere")).toEqual({ name: "home" });
  });
});

describe("navigate", () => {
  it("updates the route synchronously and the hash", () => {
    navigate("/solo");
    expect(route.value).toEqual({ name: "solo" });
    expect(location.hash).toBe("#/solo");
    navigate("/game/zz99");
    expect(route.value).toEqual({ name: "game", code: "ZZ99", create: false });
  });
});

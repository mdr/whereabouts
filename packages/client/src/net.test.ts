// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { describeDisconnect } from "./net";

describe("describeDisconnect", () => {
  it("explains a destroyed room in player terms", () => {
    const r = describeDisconnect(1000, "room_destroyed");
    expect(r.title).toBe("That game has ended");
    expect(r.detail).toContain("Everyone left");
  });

  it("recognises unknown codes, finished games and superseded tabs", () => {
    expect(describeDisconnect(4001, undefined).title).toBe("No game with that code");
    expect(describeDisconnect(1000, "game has finished").title).toBe("That game has finished");
    expect(describeDisconnect(1000, "replaced by a newer connection").title).toBe("You joined from another tab");
    expect(describeDisconnect(1000, "removed by the host")).toMatchObject({
      title: "You were removed from the game",
      removed: true,
    });
    expect(describeDisconnect(0, "reconnect_failed").title).toBe("Lost the connection");
  });

  it("falls back to the raw reason or the close code", () => {
    expect(describeDisconnect(1006, undefined).detail).toContain("1006");
    expect(describeDisconnect(1000, "something odd").detail).toBe("something odd");
  });
});

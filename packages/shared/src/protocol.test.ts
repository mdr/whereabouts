import { describe, expect, it } from "vitest";
import { KickSchema, PaintSubmissionSchema, decodeTicket, encodeTicket, type Ticket } from "./protocol.ts";

describe("ticket codec", () => {
  const ticket: Ticket = { v: 1, token: "0123456789abcdef0123456789abcdef", name: "Zoë 🌍", code: "AB12" };

  it("round-trips unicode names and stays header-safe", () => {
    const raw = encodeTicket(ticket);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeTicket(raw)).toEqual(ticket);
  });

  /** Encode an arbitrary object the same way a hostile client might. */
  const enc = (value: unknown) => encodeTicket(value as Ticket);

  it("rejects garbage, wrong versions and bad shapes", () => {
    expect(decodeTicket("not-base64!!")).toBeNull();
    expect(decodeTicket(enc({}))).toBeNull();
    expect(decodeTicket(enc({ ...ticket, v: 2 }))).toBeNull();
    expect(decodeTicket(enc({ ...ticket, token: "short" }))).toBeNull();
    expect(decodeTicket(enc({ ...ticket, code: "ab12" }))).toBeNull();
    expect(decodeTicket(enc({ ...ticket, name: "   " }))).toBeNull();
    expect(decodeTicket(enc("a string"))).toBeNull();
  });

  it("trims names", () => {
    const raw = encodeTicket({ ...ticket, name: "  Matt  " });
    expect(decodeTicket(raw)?.name).toBe("Matt");
  });
});

describe("paint submission schema", () => {
  it("accepts H3 indexes with positive weights and a floor in range", () => {
    const ok = PaintSubmissionSchema.safeParse({ cells: { "8428309ffffffff": 0.5 }, floor: 0.1 });
    expect(ok.success).toBe(true);
  });
  it("rejects bad indexes, non-positive weights and floors out of range", () => {
    expect(PaintSubmissionSchema.safeParse({ cells: { nope: 1 }, floor: 0 }).success).toBe(false);
    expect(PaintSubmissionSchema.safeParse({ cells: { "8428309ffffffff": 0 }, floor: 0 }).success).toBe(false);
    expect(PaintSubmissionSchema.safeParse({ cells: { "8428309ffffffff": Infinity }, floor: 0 }).success).toBe(false);
    expect(PaintSubmissionSchema.safeParse({ cells: {}, floor: 1.5 }).success).toBe(false);
  });
});

describe("ConfigureSchema", () => {
  it("accepts supported values and rejects the rest", async () => {
    const { ConfigureSchema } = await import("./protocol.ts");
    expect(ConfigureSchema.safeParse({ rounds: 5 }).success).toBe(true);
    expect(ConfigureSchema.safeParse({ roundMs: 45_000 }).success).toBe(true);
    expect(ConfigureSchema.safeParse({ rounds: 0 }).success).toBe(false);
    expect(ConfigureSchema.safeParse({ rounds: 16 }).success).toBe(false);
    expect(ConfigureSchema.safeParse({ roundMs: 61_000 }).success).toBe(false);
    expect(ConfigureSchema.safeParse({ photoShare: 0.75 }).success).toBe(true);
    expect(ConfigureSchema.safeParse({ photoShare: 0.6 }).success).toBe(false);
    expect(ConfigureSchema.safeParse({ mapDetail: "political" }).success).toBe(true);
    expect(ConfigureSchema.safeParse({ mapDetail: "satellite" }).success).toBe(false);
  });
});

describe("kick schema", () => {
  it("needs a player id", () => {
    expect(KickSchema.safeParse({ playerId: "p2" }).success).toBe(true);
    expect(KickSchema.safeParse({}).success).toBe(false);
    expect(KickSchema.safeParse({ playerId: "" }).success).toBe(false);
  });
});

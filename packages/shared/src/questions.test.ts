import { describe, expect, it } from "vitest";
import { QUESTIONS, pickQuestions } from "./questions.ts";
import { greatCircleDistance } from "./geo.ts";

describe("question pool", () => {
  it("has unique ids, valid coordinates and sensible tolerances", () => {
    const ids = new Set<string>();
    for (const q of QUESTIONS) {
      expect(ids.has(q.id), `duplicate id ${q.id}`).toBe(false);
      ids.add(q.id);
      expect(Math.abs(q.answer.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(q.answer.lon)).toBeLessThanOrEqual(180);
      expect(q.toleranceKm).toBeGreaterThanOrEqual(1);
      expect(q.toleranceKm).toBeLessThanOrEqual(1500);
      expect(q.prompt.length).toBeGreaterThan(0);
      expect(q.label.length).toBeGreaterThan(0);
      if (q.kind === "photo") expect(q.image, `${q.id} needs an image`).toBeTruthy();
      else expect(q.image).toBeUndefined();
    }
  });

  it("text questions name the place in the prompt, photo questions do not", () => {
    for (const q of QUESTIONS) {
      if (q.kind === "text") expect(q.prompt).toMatch(/^Where (is|are) /);
      else expect(q.prompt).toBe("Where is this?");
    }
  });

  it("keeps a healthy mix of scales", () => {
    const text = QUESTIONS.filter((q) => q.kind === "text");
    expect(text.length).toBeGreaterThanOrEqual(100);
    const tight = text.filter((q) => q.toleranceKm <= 60).length;
    const loose = text.filter((q) => q.toleranceKm >= 700).length;
    expect(tight).toBeGreaterThanOrEqual(8);
    expect(loose).toBeGreaterThanOrEqual(8);
  });

  it("does not place two text questions on the same spot", () => {
    const text = QUESTIONS.filter((q) => q.kind === "text");
    for (let i = 0; i < text.length; i++) {
      for (let j = i + 1; j < text.length; j++) {
        const d = greatCircleDistance(text[i]!.answer, text[j]!.answer);
        // Rome and Vatican City are the one deliberate near-pair.
        const pair = [text[i]!.id, text[j]!.id].sort().join("+");
        if (pair === "rome+vatican") continue;
        expect(d, `${text[i]!.id} and ${text[j]!.id} are ${d.toFixed(0)} km apart`).toBeGreaterThan(20);
      }
    }
  });
});

describe("pickQuestions", () => {
  const mk = (kind: "photo" | "text", n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${kind}${i}`,
      kind,
      prompt: kind === "photo" ? "Where is this?" : "Where is X?",
      answer: { lat: 0, lon: 0 },
      toleranceKm: 100,
      label: "x",
      region: "world" as const,
    }));

  it("balances kinds as evenly as the pool allows and is deterministic per seed", () => {
    const pool = [...mk("photo", 20), ...mk("text", 100)];
    const picked = pickQuestions(pool, 8, 7);
    expect(picked).toHaveLength(8);
    expect(picked.filter((q) => q.kind === "photo")).toHaveLength(4);
    expect(new Set(picked.map((q) => q.id)).size).toBe(8);
    expect(pickQuestions(pool, 8, 7).map((q) => q.id)).toEqual(picked.map((q) => q.id));
    expect(pickQuestions(pool, 8, 8).map((q) => q.id)).not.toEqual(picked.map((q) => q.id));
  });

  it("tops up from the other kind when one runs short, and never exceeds the pool", () => {
    const pool = [...mk("photo", 2), ...mk("text", 100)];
    const picked = pickQuestions(pool, 8, 1);
    expect(picked.filter((q) => q.kind === "photo")).toHaveLength(2);
    expect(picked).toHaveLength(8);
    expect(pickQuestions(mk("text", 3), 8, 1)).toHaveLength(3);
  });

  it("does not run the kinds in a fixed order", () => {
    const pool = [...mk("photo", 50), ...mk("text", 50)];
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      orders.add(
        pickQuestions(pool, 6, seed)
          .map((q) => q.kind[0])
          .join(""),
      );
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});

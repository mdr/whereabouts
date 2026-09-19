import { describe, expect, it } from "vitest";
import { QUESTIONS } from "./questions.ts";
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

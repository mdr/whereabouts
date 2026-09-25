// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { isTyping } from "./keys";

const input = (type: string) => Object.assign(document.createElement("input"), { type });

describe("isTyping", () => {
  it("counts text entry as typing", () => {
    for (const type of ["text", "search", "email", "number", "password"])
      expect(isTyping(input(type)), type).toBe(true);
    expect(isTyping(document.createElement("textarea"))).toBe(true);
    expect(isTyping(document.createElement("select"))).toBe(true);
  });

  it("does not count a focused slider, checkbox or button, so shortcuts still work", () => {
    for (const type of ["range", "checkbox", "radio", "button"]) expect(isTyping(input(type)), type).toBe(false);
    expect(isTyping(document.createElement("button"))).toBe(false);
    expect(isTyping(document.body)).toBe(false);
    expect(isTyping(window)).toBe(false);
  });
});

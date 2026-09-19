// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { QuestionCard } from "./bits";

const q = { prompt: "Where is this?", image: "Some_file.jpg", toleranceKm: 50 };

describe("QuestionCard image", () => {
  it("enlarges on click and shrinks on Escape or click", () => {
    const { container } = render(<QuestionCard q={q} />);
    expect(container.querySelector(".lightbox")).toBeNull();
    fireEvent.click(container.querySelector(".thumb img")!);
    expect(container.querySelector(".lightbox img")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".lightbox")).toBeNull();
    fireEvent.click(container.querySelector(".thumb img")!);
    fireEvent.click(container.querySelector(".lightbox")!);
    expect(container.querySelector(".lightbox")).toBeNull();
  });

  it("keeps the Commons credit behind an info icon linking to the file page", () => {
    const { container } = render(<QuestionCard q={q} />);
    const credit = container.querySelector<HTMLAnchorElement>(".thumb .credit-icon")!;
    expect(credit.href).toContain("commons.wikimedia.org");
    expect(credit.getAttribute("aria-label")).toContain("Wikimedia Commons");
    expect(container.textContent).not.toContain("Wikimedia");
  });
});

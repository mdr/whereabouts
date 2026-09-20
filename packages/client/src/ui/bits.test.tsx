// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { HudBottom, QuestionCard } from "./bits";

describe("HudBottom", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty("--toolbar-h");
  });

  it("publishes its height as --toolbar-h while mounted", () => {
    // happy-dom has no ResizeObserver and reports zero heights; stub both.
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      },
    );
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 96 });
    const { container, unmount } = render(
      <HudBottom>
        <button>Done</button>
      </HudBottom>,
    );
    expect(container.querySelector(".hud-bottom.toolbar button")!.textContent).toBe("Done");
    expect(document.documentElement.style.getPropertyValue("--toolbar-h")).toBe("96px");
    expect(observe).toHaveBeenCalledWith(container.firstElementChild);
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--toolbar-h")).toBe("");
  });
});

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

  it("keeps the Commons credit behind an info icon linking to the file page, only when asked", () => {
    // While guessing there is no credit link at all: the file name is a spoiler.
    const { container: guessing } = render(<QuestionCard q={q} />);
    expect(guessing.querySelector(".credit-icon")).toBeNull();

    const { container } = render(<QuestionCard q={q} credit />);
    const credit = container.querySelector<HTMLAnchorElement>(".thumb .credit-icon")!;
    expect(credit.href).toContain("commons.wikimedia.org");
    expect(credit.getAttribute("aria-label")).toContain("Wikimedia Commons");
    expect(container.textContent).not.toContain("Wikimedia");
  });
});

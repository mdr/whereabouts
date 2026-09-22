// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/preact";
import { Countdown, HudBottom, QuestionCard } from "./bits";

describe("Countdown", () => {
  afterEach(() => vi.useRealTimers());

  it("never ticks back up when the clock estimate jumps", () => {
    vi.useFakeTimers();
    let ms = 10_100;
    const { container } = render(<Countdown msRemaining={() => ms} />);
    const shown = () => container.querySelector(".countdown")!.textContent;
    expect(shown()).toBe("11");
    ms = 9_900;
    void act(() => void vi.advanceTimersByTime(250));
    expect(shown()).toBe("10");
    // A late server message nudges the offset so the deadline looks 300 ms further away.
    ms = 10_200;
    void act(() => void vi.advanceTimersByTime(250));
    expect(shown()).toBe("10");
  });
});

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
  it("enlarges on click and shrinks on Escape, the close button, or a backdrop click", () => {
    const { container } = render(<QuestionCard q={q} />);
    expect(container.querySelector(".lightbox")).toBeNull();
    fireEvent.click(container.querySelector(".thumb img")!);
    expect(container.querySelector(".lightbox img")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".lightbox")).toBeNull();
    fireEvent.click(container.querySelector(".thumb img")!);
    fireEvent.click(container.querySelector(".lightbox")!);
    expect(container.querySelector(".lightbox")).toBeNull();
    fireEvent.click(container.querySelector(".thumb img")!);
    fireEvent.click(container.querySelector(".lightbox-close")!);
    expect(container.querySelector(".lightbox")).toBeNull();
  });

  it("zooms the enlarged photo: click toggles a closer look, the wheel zooms in and out", () => {
    const { container } = render(<QuestionCard q={q} />);
    fireEvent.click(container.querySelector(".thumb img")!);
    const img = container.querySelector<HTMLImageElement>(".lightbox img")!;
    expect(img.style.transform).toContain("scale(1)");
    // The lightbox asks for a bigger rendition than the thumbnail.
    expect(img.src).toContain("width=1600");
    fireEvent.click(img);
    expect(img.style.transform).toContain("scale(2.5)");
    expect(container.querySelector(".lightbox-frame")!.className).toContain("zoomed");
    // Clicking the picture does not close the lightbox.
    expect(container.querySelector(".lightbox")).not.toBeNull();
    fireEvent.click(img);
    expect(img.style.transform).toContain("scale(1)");
    fireEvent.wheel(container.querySelector(".lightbox-frame")!, { deltaY: -500 });
    const scale = Number(/scale\(([\d.]+)\)/.exec(img.style.transform)![1]);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(6);
    fireEvent.wheel(container.querySelector(".lightbox-frame")!, { deltaY: 5000 });
    expect(img.style.transform).toContain("scale(1)");
    expect(img.style.transform).toContain("translate(0px, 0px)");
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

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { ConfirmDialog, endGameRequest, kickRequest, makeHostRequest } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing without a request", () => {
    render(<ConfirmDialog request={null} onClose={() => {}} />);
    expect(document.body.querySelector(".modal")).toBeNull();
  });

  it("confirms only on the confirm button; cancel, backdrop and Escape just close", () => {
    let confirmed = 0;
    let closed = 0;
    const request = kickRequest("Bob", () => confirmed++);
    render(<ConfirmDialog request={request} onClose={() => closed++} />);
    expect(document.body.querySelector("h2")!.textContent).toBe("Remove Bob from the game?");
    expect(document.body.textContent).toContain("rejoin with the code");

    fireEvent.click(document.body.querySelector("button:not(.danger)")!);
    expect(closed).toBe(1);
    expect(confirmed).toBe(0);

    fireEvent.click(document.body.querySelector(".modal-backdrop")!);
    expect(closed).toBe(2);
    fireEvent.click(document.body.querySelector(".modal")!); // inside: no close
    expect(closed).toBe(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(closed).toBe(3);
    expect(confirmed).toBe(0);

    fireEvent.click(document.body.querySelector("button.danger")!);
    expect(confirmed).toBe(1);
    expect(closed).toBe(4);
  });

  it("renders into <body>, so a transformed parent such as the toolbar cannot trap it", () => {
    render(
      <div class="hud-bottom" style={{ transform: "translateX(-50%)" }}>
        <ConfirmDialog request={endGameRequest(() => {})} onClose={() => {}} />
      </div>,
    );
    const backdrop = document.body.querySelector(".modal-backdrop")!;
    expect(backdrop.parentElement).toBe(document.body);
    expect(backdrop.closest(".hud-bottom")).toBeNull();
  });

  it("words the end-game request as a destructive action", () => {
    const r = endGameRequest(() => {});
    expect(r.title).toBe("End the game now?");
    expect(r.confirmLabel).toBe("End game");
  });

  it("shows handing over as a plain confirm, and removing as a red one", () => {
    const { unmount } = render(<ConfirmDialog request={makeHostRequest("Bob", () => {})} onClose={() => {}} />);
    const confirm = () =>
      [...document.body.querySelectorAll<HTMLButtonElement>(".modal-actions button:last-child")].at(-1)!;
    expect(confirm().textContent).toBe("Make Bob host");
    expect(confirm().className).toBe("primary");
    unmount();
    render(<ConfirmDialog request={kickRequest("Bob", () => {})} onClose={() => {}} />);
    expect(confirm().className).toContain("danger");
  });
});

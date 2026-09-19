// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { ConfirmDialog, endGameRequest, kickRequest } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing without a request", () => {
    const { container } = render(<ConfirmDialog request={null} onClose={() => {}} />);
    expect(container.querySelector(".modal")).toBeNull();
  });

  it("confirms only on the confirm button; cancel, backdrop and Escape just close", () => {
    let confirmed = 0;
    let closed = 0;
    const request = kickRequest("Bob", () => confirmed++);
    const { container } = render(<ConfirmDialog request={request} onClose={() => closed++} />);
    expect(container.querySelector("h2")!.textContent).toBe("Remove Bob from the game?");
    expect(container.textContent).toContain("rejoin with the code");

    fireEvent.click(container.querySelector("button:not(.danger)")!);
    expect(closed).toBe(1);
    expect(confirmed).toBe(0);

    fireEvent.click(container.querySelector(".modal-backdrop")!);
    expect(closed).toBe(2);
    fireEvent.click(container.querySelector(".modal")!); // inside: no close
    expect(closed).toBe(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(closed).toBe(3);
    expect(confirmed).toBe(0);

    fireEvent.click(container.querySelector("button.danger")!);
    expect(confirmed).toBe(1);
    expect(closed).toBe(4);
  });

  it("words the end-game request as a destructive action", () => {
    const r = endGameRequest(() => {});
    expect(r.title).toBe("End the game now?");
    expect(r.confirmLabel).toBe("End game");
  });
});

// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { Pills, Stepper } from "./Controls";

const options = [
  { value: 30, label: "30" },
  { value: 60, label: "60" },
];

describe("Pills", () => {
  it("marks the current choice and reports a new one", () => {
    const onChange = vi.fn();
    const { container } = render(<Pills label="Seconds" options={options} value={60} onChange={onChange} />);
    const [a, b] = container.querySelectorAll("button");
    expect(b!.getAttribute("aria-checked")).toBe("true");
    expect(a!.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(a!);
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it("is read-only without onChange", () => {
    const { container } = render(<Pills label="Seconds" options={options} value={60} />);
    expect([...container.querySelectorAll("button")].every((b) => b.disabled)).toBe(true);
    expect(container.querySelector("button.on")!.textContent).toBe("60");
  });
});

describe("Stepper", () => {
  it("steps within its bounds", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<Stepper label="Rounds" value={1} min={1} max={15} onChange={onChange} />);
    const fewer = () => container.querySelector<HTMLButtonElement>('[aria-label="Fewer rounds"]')!;
    const more = () => container.querySelector<HTMLButtonElement>('[aria-label="More rounds"]')!;
    expect(fewer().disabled).toBe(true);
    fireEvent.click(more());
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(<Stepper label="Rounds" value={15} min={1} max={15} onChange={onChange} />);
    expect(more().disabled).toBe(true);
  });

  it("shows just the number without onChange", () => {
    const { container } = render(<Stepper label="Rounds" value={8} min={1} max={15} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.textContent).toBe("8");
  });
});

// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { Pills, StopSlider, Stepper } from "./Controls";

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
});

describe("StopSlider", () => {
  const mixes = [
    { value: 1, label: "Photos" },
    { value: 0.5, label: "Even" },
    { value: 0, label: "Place names" },
  ];

  it("names the current stop and both ends, and reports only a change of stop", () => {
    const onChange = vi.fn();
    const { container } = render(<StopSlider label="Questions" options={mixes} value={0.5} onChange={onChange} />);
    const input = container.querySelector<HTMLInputElement>("input[type=range]")!;
    expect(input.value).toBe("1");
    expect(container.querySelector(".current")!.textContent).toBe("Even");
    expect(container.querySelector(".ends")!.textContent).toBe("PhotosPlace names");
    fireEvent.input(input, { target: { value: "1" } }); // same stop: nothing to send
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.input(input, { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});

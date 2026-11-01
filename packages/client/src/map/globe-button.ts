import type { IControl } from "maplibre-gl"

/** A button with the zoom buttons that asks for the other projection; `show` says which projection is on. */
export class GlobeButton implements IControl {
  private readonly button = document.createElement("button")

  constructor(onToggle: () => void, testId: string) {
    this.button.type = "button"
    this.button.dataset["testid"] = testId
    this.button.innerHTML = '<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>'
    this.button.addEventListener("click", onToggle)
    this.show(false)
  }

  show(globe: boolean): void {
    // MapLibre's own globe icons: the one shown says what a click switches to.
    this.button.classList.toggle("maplibregl-ctrl-globe-enabled", globe)
    this.button.classList.toggle("maplibregl-ctrl-globe", !globe)
    this.button.title = globe ? "Flat map" : "Globe"
    this.button.setAttribute("aria-pressed", String(globe))
  }

  onAdd(): HTMLElement {
    const control = document.createElement("div")
    control.className = "maplibregl-ctrl maplibregl-ctrl-group globe-ctrl"
    control.append(this.button)
    return control
  }

  onRemove(): void {
    this.button.parentElement?.remove()
  }
}

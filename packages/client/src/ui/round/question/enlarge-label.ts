/** The "Enlarge" label shows on the first photo of a session only; after that, just the icon. */
export class EnlargeLabel {
  #shown = false

  /** Whether this photo gets the label. */
  take(): boolean {
    const first = !this.#shown
    this.#shown = true
    return first
  }
}

export const enlargeLabel = new EnlargeLabel()

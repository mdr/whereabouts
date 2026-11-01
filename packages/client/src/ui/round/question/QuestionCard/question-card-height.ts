import { signal } from "@preact/signals"
import type { Px } from "@whereabouts/shared/units"

/** The question card's height, so a phone's reveal can frame the map again when the card grows or shrinks. */
export const questionCardHeight = signal<Px>(0)

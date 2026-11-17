import type { RefObject } from "preact"
import { useRef } from "preact/hooks"

/** An element's `ref`: Preact holds null in it when empty, so the one null lives here. */
// oxlint-disable-next-line eslint-js/no-restricted-syntax
export type ElementRef<T extends Element> = RefObject<T | null>

/** A ref for an element's `ref` prop. */
export const useElementRef = <T extends Element>(): ElementRef<T> =>
  // oxlint-disable-next-line eslint-js/no-restricted-syntax
  useRef<T | null>(null)

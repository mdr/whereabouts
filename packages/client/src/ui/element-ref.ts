import type { RefObject } from "preact"
import { useRef } from "preact/hooks"

/** A ref for an element's `ref` prop. Preact's element refs hold null when empty, so the one null lives here. */
export function useElementRef<T extends Element>(): RefObject<T> {
  // eslint-disable-next-line no-restricted-syntax
  return useRef<T>(null)
}

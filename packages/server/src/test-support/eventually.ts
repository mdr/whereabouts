import type { Ms } from "@whereabouts/shared/units"

/** Wait until `done` holds, failing with what was awaited. */
export const eventually = async (done: () => boolean, what: () => string, ms: Ms = 3000): Promise<void> => {
  const start = Date.now()
  while (!done()) {
    if (Date.now() - start > ms) throw new Error(`gave up waiting ${ms}ms for ${what()}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

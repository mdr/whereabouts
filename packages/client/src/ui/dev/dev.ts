/**
 * Developer mode: extra panels and cheats for playtesting. Switched on by a
 * `dev` query parameter, either on the page (`/?dev#/solo`) or in the hash
 * (`#/solo?dev`). Once on it stays on for the page's lifetime, so hash
 * navigation does not lose it; the drawer has a button to turn it off.
 */
import { signal } from "@preact/signals"

export function hasDevFlag(location: { search: string; hash: string }): boolean {
  if (new URLSearchParams(location.search).has("dev")) return true
  const queryStart = location.hash.indexOf("?")
  return queryStart >= 0 && new URLSearchParams(location.hash.slice(queryStart)).has("dev")
}

export const devMode = signal(hasDevFlag(location))

window.addEventListener("hashchange", () => {
  if (hasDevFlag(location)) devMode.value = true
})

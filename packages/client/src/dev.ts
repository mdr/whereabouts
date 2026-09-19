/**
 * Developer mode: extra panels and cheats for playtesting. Switched on by a
 * `dev` query parameter, either on the page (`/?dev#/solo`) or in the hash
 * (`#/solo?dev`). Once on it stays on for the page's lifetime, so hash
 * navigation does not lose it; the drawer has a button to turn it off.
 */
import { signal } from "@preact/signals";

export function hasDevFlag(loc: { search: string; hash: string }): boolean {
  if (new URLSearchParams(loc.search).has("dev")) return true;
  const q = loc.hash.indexOf("?");
  return q >= 0 && new URLSearchParams(loc.hash.slice(q)).has("dev");
}

export const devMode = signal(hasDevFlag(location));

window.addEventListener("hashchange", () => {
  if (hasDevFlag(location)) devMode.value = true;
});

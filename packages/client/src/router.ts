/** Tiny hash router: "#/", "#/solo", "#/game/CODE", "#/game/new". */
import { signal } from "@preact/signals";

export type Route = { name: "home" } | { name: "solo" } | { name: "game"; code: string; create: boolean };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  if (path === "/solo") return { name: "solo" };
  if (path === "/game/new") return { name: "game", code: "", create: true };
  const m = /^\/game\/([A-Z0-9]{4,6})$/i.exec(path);
  if (m) return { name: "game", code: m[1]!.toUpperCase(), create: false };
  return { name: "home" };
}

export const route = signal<Route>(parseRoute(location.hash));

// Back/forward and hand-edited URLs.
window.addEventListener("hashchange", () => {
  route.value = parseRoute(location.hash);
});

/** Update the URL and the route together, so callers see the change synchronously. */
export function navigate(to: string): void {
  if (location.hash !== `#${to}`) location.hash = to;
  route.value = parseRoute(to);
}

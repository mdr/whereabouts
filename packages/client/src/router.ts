/** Tiny hash router: "#/", "#/solo", "#/game/CODE". */
import { signal } from "@preact/signals";

export type Route = { name: "home" } | { name: "solo" } | { name: "game"; code: string; create: boolean };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "");
  if (path === "/solo") return { name: "solo" };
  const m = /^\/game\/([A-Z0-9]{4,6})$/i.exec(path);
  if (m) return { name: "game", code: m[1]!.toUpperCase(), create: false };
  if (path === "/game/new") return { name: "game", code: "", create: true };
  return { name: "home" };
}

export const route = signal<Route>(parse(location.hash));
window.addEventListener("hashchange", () => {
  route.value = parse(location.hash);
});

export function navigate(to: string): void {
  if (location.hash === `#${to}`) route.value = parse(location.hash);
  else location.hash = to;
}

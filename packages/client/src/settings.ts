/** Per-browser preferences and identity, persisted where it makes sense. */
import { effect, signal } from "@preact/signals";

function persisted<T extends string | boolean>(key: string, initial: T, storage: Storage = localStorage) {
  let start = initial;
  try {
    const raw = storage.getItem(key);
    if (raw !== null) start = (typeof initial === "boolean" ? raw === "true" : raw) as T;
  } catch {
    /* storage unavailable */
  }
  const s = signal<T>(start);
  effect(() => {
    try {
      storage.setItem(key, String(s.value));
    } catch {
      /* ignore */
    }
  });
  return s;
}

export const playerName = persisted<string>("wa.name", "");
export const showLabels = persisted("wa.labels", false);
export const showBorders = persisted("wa.borders", false);
export const showDetail = persisted("wa.detail", false);
export const showInlandWater = persisted("wa.water", false);
export const cheatLiveScore = persisted("wa.cheat", false);
export const soloKernelId = persisted<string>("wa.kernel", "single");

/**
 * Reconnect token. Session storage so two tabs in one browser are two
 * players, while a refresh of one tab keeps its seat.
 */
export const playerToken = persisted<string>("wa.token", randomToken(), sessionStorage);

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

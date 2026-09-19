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
export const cheatLiveScore = persisted<boolean>("wa.cheat", false);
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

/**
 * Name handed from the home screen to the game screen when joining by code
 * there, so the player is not asked to confirm it a second time. Arriving by
 * link leaves this null and the game screen asks.
 */
export const nameHandoff = signal<string | null>(null);

/**
 * The game this tab last sat in. A refresh of that tab reclaims the seat by
 * token, so it should not ask for a name again.
 */
export const joinedCode = persisted<string>("wa.joined", "", sessionStorage);

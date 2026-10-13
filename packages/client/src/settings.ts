/** Per-browser preferences and identity, persisted where it makes sense. */
import { effect, signal } from "@preact/signals"
import { DEFAULT_KERNEL, PlayerTokenSchema, playerToken, type MapDetail, type PlayerToken } from "@whereabouts/shared"

function persisted<T extends string | boolean>(key: string, initial: T, storage: Storage = localStorage) {
  let start = initial
  try {
    const raw = storage.getItem(key)
    if (raw !== null) start = (typeof initial === "boolean" ? raw === "true" : raw) as T
  } catch {
    /* storage unavailable */
  }
  const s = signal<T>(start)
  effect(() => {
    try {
      storage.setItem(key, String(s.value))
    } catch {
      /* ignore */
    }
  })
  return s
}

/** Like persisted, for a JSON value; anything unreadable starts from the initial value. */
function persistedJson<T>(key: string, initial: T) {
  let start = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) start = JSON.parse(raw) as T
  } catch {
    /* storage unavailable, or not JSON */
  }
  const s = signal<T>(start)
  effect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(s.value))
    } catch {
      /* ignore */
    }
  })
  return s
}

export const playerName = persisted<string>("wa.name", "")
export const cheatLiveScore = persisted<boolean>("wa.cheat", false)
/**
 * Practice scores with the same kernel as games unless the dev drawer picks
 * another. A new key: "wa.kernel" was written on every visit while practice
 * defaulted to the single Gaussian, so its value says nothing about a choice.
 */
export const soloKernelId = persisted<string>("wa.practiceKernel", DEFAULT_KERNEL.id)
try {
  localStorage.removeItem("wa.kernel")
} catch {
  /* storage unavailable */
}
/** What practice asks: places (points), whole countries (regions), flags (either, by size), islands, lakes and seas, or US states. */
export type PracticePool = "places" | "countries" | "flags" | "features" | "states"
export const soloPool = persisted<PracticePool>("wa.practicePool", "places")
/** Map detail while guessing in practice (one of MAP_DETAILS). */
export const soloMapDetail = persisted<MapDetail>("wa.mapDetail", "minimal")
/** Begin each round on the Pan tool rather than Paint; tablet players often want to look first. */
export const startOnPan = persisted<boolean>("wa.startOnPan", false)
/** Game sounds on this device: the spray, the countdown and the round cues. */
export const soundOn = persisted<boolean>("wa.sound", true)
/**
 * The setup this browser last chose as host (see host-setup.ts). Stored as
 * read, so each value is checked before it is used.
 */
export const hostSetup = persistedJson<unknown>("wa.hostSetup", {})

/**
 * Reconnect token. Session storage so two tabs in one browser are two
 * players, while a refresh of one tab keeps its seat.
 */
const storedToken = persisted<string>("wa.token", randomToken(), sessionStorage)

/** This tab's seat token: a new one if what was stored is not one. */
export function seatToken(): PlayerToken {
  const stored = PlayerTokenSchema.safeParse(storedToken.value)
  if (stored.success) return stored.data
  const fresh = randomToken()
  storedToken.value = fresh
  return fresh
}

/** Forget this tab's seat, e.g. after the host removed us; the next join is as a new player. */
export function resetPlayerToken(): void {
  storedToken.value = randomToken()
}

function randomToken(): PlayerToken {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return playerToken(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""))
}

/**
 * Name handed from the home screen to the game screen when joining by code
 * there, so the player is not asked to confirm it a second time. Arriving by
 * link leaves this null and the game screen asks.
 */
export const nameHandoff = signal<string | null>(null)

/** Handed over with the name when the home screen's "Just watch" was used. */
export const watchHandoff = signal(false)

/**
 * Whether this tab asked to watch the game it joined. A spectator who did
 * not ask was seated as one because the game was full, and is told so.
 */
export const askedToWatch = signal(false)

/**
 * The game this tab last sat in. A refresh of that tab reclaims the seat by
 * token, so it should not ask for a name again.
 */
export const joinedCode = persisted<string>("wa.joined", "", sessionStorage)

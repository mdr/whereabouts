/** Per-browser preferences and identity, persisted where it makes sense. */
import { effect, signal } from "@preact/signals"
import { z } from "zod"
import {
  DEFAULT_KERNEL,
  KernelIdSchema,
  MapDetailSchema,
  PlayerNameSchema,
  PlayerTokenSchema,
  RoomCodeSchema,
  playerToken,
  type PlayerName,
  type PlayerToken
} from "@whereabouts/shared"

/** A stored value that fails `schema`, such as one an older version wrote, starts from the initial value. */
function persisted<S extends z.ZodType<string | boolean>>(
  key: string,
  schema: S,
  initial: z.output<S>,
  storage: Storage = localStorage
) {
  let start = initial
  try {
    const parsed = schema.safeParse(storage.getItem(key))
    if (parsed.success) start = parsed.data
  } catch {
    /* storage unavailable */
  }
  const s = signal(start)
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

/** The name as last typed, which may not yet be one a game accepts (see nameToJoin). */
export const savedName = persisted("wa.name", z.string(), "")
export const cheatLiveScore = persisted("wa.cheat", z.stringbool(), false)
/**
 * Practice scores with the same kernel as games unless the dev drawer picks
 * another. A new key: "wa.kernel" was written on every visit while practice
 * defaulted to the single Gaussian, so its value says nothing about a choice.
 */
export const soloKernelId = persisted("wa.practiceKernel", KernelIdSchema, DEFAULT_KERNEL.id)
try {
  localStorage.removeItem("wa.kernel")
} catch {
  /* storage unavailable */
}
/** What practice asks: places (points), whole countries (regions), flags (either, by size), islands, lakes and seas, or US states. */
const PracticePoolSchema = z.enum(["places", "countries", "flags", "features", "states"])
export type PracticePool = z.infer<typeof PracticePoolSchema>
export const soloPool = persisted("wa.practicePool", PracticePoolSchema, "places")
/** Map detail while guessing in practice (one of MAP_DETAILS). */
export const soloMapDetail = persisted("wa.mapDetail", MapDetailSchema, "minimal")
/** Begin each round on the Pan tool rather than Paint; tablet players often want to look first. */
export const startOnPan = persisted("wa.startOnPan", z.stringbool(), false)
/** Game sounds on this device: the spray, the countdown and the round cues. */
export const soundOn = persisted("wa.sound", z.stringbool(), true)
/**
 * The setup this browser last chose as host (see host-setup.ts). Stored as
 * read, so each value is checked before it is used.
 */
export const hostSetup = persistedJson<unknown>("wa.hostSetup", {})

/**
 * Reconnect token. Session storage so two tabs in one browser are two
 * players, while a refresh of one tab keeps its seat.
 */
const storedToken = persisted("wa.token", PlayerTokenSchema, randomToken(), sessionStorage)

export function seatToken(): PlayerToken {
  return storedToken.value
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
export const nameHandoff = signal<PlayerName | null>(null)

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
export const joinedCode = persisted("wa.joined", RoomCodeSchema.or(z.literal("")), "", sessionStorage)

/** A typed name as a game takes it, or null if it would not. */
export function nameToJoin(typed: string): PlayerName | null {
  const parsed = PlayerNameSchema.safeParse(typed)
  return parsed.success ? parsed.data : null
}

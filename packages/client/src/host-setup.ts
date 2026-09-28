/**
 * The host's last game setup, remembered in this browser so their next game
 * starts the same way. Saved only from the host's own choices in the lobby,
 * and applied only to a game this tab has just created.
 */
import { useEffect, useRef } from "preact/hooks";
import { ConfigureSchema, MAX_ROUNDS, type ConfigurePatch, type GameView, type QuestionMix } from "@whereabouts/shared";
import type { Connection } from "./net";
import { hostSetup } from "./settings";

const FIELDS = Object.keys(ConfigureSchema.shape) as (keyof ConfigurePatch)[];

/**
 * The saved setup as a patch the server will accept. Each setting is checked
 * against the options the game offers today and dropped alone if it is no
 * longer one of them, since the server rejects a patch with any bad value.
 */
export function savedSetupPatch(saved: unknown): ConfigurePatch {
  const patch: Record<string, unknown> = {};
  if (typeof saved !== "object" || saved === null) return patch;
  const setup = { ...(saved as Record<string, unknown>) };
  setup.mix ??= mixFromOldSetup(setup);
  for (const field of FIELDS) {
    const value = setup[field];
    if (value === undefined) continue;
    const parsed = ConfigureSchema.shape[field].safeParse(value);
    if (parsed.success && parsed.data !== undefined) patch[field] = parsed.data;
  }
  return patch;
}

/** Change the game's setup as host, and remember it for the next game. */
export function configureAsHost(conn: Connection, patch: ConfigurePatch): void {
  conn.configure(patch);
  hostSetup.value = { ...savedSetupPatch(hostSetup.value), ...patch };
}

/** Once a game this tab created reaches its lobby, give it the remembered setup. */
export function useSavedSetup(conn: Connection, view: GameView | null, created: boolean): void {
  const applied = useRef(false);
  const ready = created && view?.phase === "lobby" && view.you.isHost;
  useEffect(() => {
    if (!ready || applied.current) return;
    applied.current = true;
    const patch = savedSetupPatch(hostSetup.value);
    if (Object.keys(patch).length > 0) conn.configure(patch);
  }, [ready]);
}

const OLD_PHOTO_SHARES = [1, 0.75, 0.5, 0.25, 0];
const OLD_SHARES: Record<string, number> = { off: 0, mixed: 0.25, only: 1 };

/**
 * A setup saved before the question mix, as a mix: the rounds, their share
 * of photos, and whole countries and flags as off, mixed in (a quarter) or
 * only, split as those games split them. Undefined when none were saved.
 */
function mixFromOldSetup(setup: Record<string, unknown>): QuestionMix | undefined {
  const { rounds, photoShare, countries, flags } = setup;
  if ([rounds, photoShare, countries, flags].every((v) => v === undefined)) return undefined;
  const r = typeof rounds === "number" && Number.isInteger(rounds) && rounds >= 1 && rounds <= MAX_ROUNDS ? rounds : 8;
  const photos = typeof photoShare === "number" && OLD_PHOTO_SHARES.includes(photoShare) ? photoShare : 0.5;
  let countryShare = OLD_SHARES[String(countries)] ?? 0;
  let flagShare = OLD_SHARES[String(flags)] ?? 0;
  const sum = countryShare + flagShare;
  if (sum > 1) {
    countryShare /= sum;
    flagShare /= sum;
  }
  const c = Math.round(r * countryShare);
  const f = Math.min(Math.round(r * flagShare), r - c);
  const named = r - c - f;
  const landmarks = Math.round(named * photos);
  return { landmarks, places: named - landmarks, countries: c, flags: f };
}

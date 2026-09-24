/**
 * The host's last game setup, remembered in this browser so their next game
 * starts the same way. Saved only from the host's own choices in the lobby,
 * and applied only to a game this tab has just created.
 */
import { useEffect, useRef } from "preact/hooks";
import { ConfigureSchema, type ConfigurePatch, type GameView } from "@whereabouts/shared";
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
  for (const field of FIELDS) {
    const value = (saved as Record<string, unknown>)[field];
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

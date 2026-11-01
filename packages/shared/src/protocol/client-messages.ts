import { z } from "zod"
import { HintAxisSchema } from "../hints.ts"
import { PlayerIdSchema, PlayerNameSchema } from "../ids.ts"
import { Role } from "../roles.ts"
import { ConfigureSchema } from "./config.ts"

const RenameSchema = z.object({ name: PlayerNameSchema })
/** Host removes a player from the game. */
export const KickSchema = z.object({ playerId: PlayerIdSchema })

/** The JSON messages. Paint goes on the paint topic in binary (see paint-wire.ts); pings, empty, on the ping topic. */
export const ClientMessageSchemas = {
  lock: z.object({}),
  unlock: z.object({}),
  ready: z.object({}),
  configure: ConfigureSchema,
  start: z.object({}),
  next: z.object({}),
  again: z.object({}),
  rename: RenameSchema,
  kick: KickSchema,
  makeHost: KickSchema,
  leave: z.object({}),
  /** Watch instead of play (lobby only), or take a free seat. */
  setRole: z.object({ role: z.enum(Role) }),
  end: z.object({}),
  /** Use one of the game's hints on this round. */
  hint: z.object({ axis: HintAxisSchema })
} as const
export type ClientTopic = keyof typeof ClientMessageSchemas
/** Each JSON topic's body, as its schema parses it. */
export type ClientMessages = { [K in ClientTopic]: z.infer<(typeof ClientMessageSchemas)[K]> }
type ClientBody<K extends ClientTopic> = z.input<(typeof ClientMessageSchemas)[K]>
/** A topic and a body its schema accepts, which may be left out when an empty body will do. */
export type ClientSend<K extends ClientTopic> =
  Record<string, never> extends ClientBody<K> ? [topic: K, body?: ClientBody<K>] : [topic: K, body: ClientBody<K>]

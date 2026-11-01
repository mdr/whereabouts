import { z } from "zod"
import { HintAxisSchema } from "../hints.ts"
import { PlayerIdSchema, PlayerNameSchema } from "../ids.ts"
import { Role } from "../roles.ts"
import { ConfigureSchema } from "./config.ts"

export enum ClientTopic {
  LOCK = "LOCK",
  UNLOCK = "UNLOCK",
  READY = "READY",
  CONFIGURE = "CONFIGURE",
  START = "START",
  NEXT = "NEXT",
  AGAIN = "AGAIN",
  RENAME = "RENAME",
  KICK = "KICK",
  MAKE_HOST = "MAKE_HOST",
  LEAVE = "LEAVE",
  SET_ROLE = "SET_ROLE",
  END = "END",
  HINT = "HINT",
  /** Binary, not JSON: see paint-wire.ts. */
  PAINT = "PAINT",
  /** Empty; answered on the server's pong topic. */
  PING = "PING"
}

const RenameSchema = z.object({ name: PlayerNameSchema })
/** Host removes a player from the game. */
export const KickSchema = z.object({ playerId: PlayerIdSchema })

/** The JSON messages, by topic. */
export const ClientMessageSchemas = {
  [ClientTopic.LOCK]: z.object({}),
  [ClientTopic.UNLOCK]: z.object({}),
  [ClientTopic.READY]: z.object({}),
  [ClientTopic.CONFIGURE]: ConfigureSchema,
  [ClientTopic.START]: z.object({}),
  [ClientTopic.NEXT]: z.object({}),
  [ClientTopic.AGAIN]: z.object({}),
  [ClientTopic.RENAME]: RenameSchema,
  [ClientTopic.KICK]: KickSchema,
  [ClientTopic.MAKE_HOST]: KickSchema,
  [ClientTopic.LEAVE]: z.object({}),
  /** Watch instead of play (lobby only), or take a free seat. */
  [ClientTopic.SET_ROLE]: z.object({ role: z.enum(Role) }),
  [ClientTopic.END]: z.object({}),
  /** Use one of the game's hints on this round. */
  [ClientTopic.HINT]: z.object({ axis: HintAxisSchema })
} as const
/** The topics whose messages are JSON. */
export type JsonTopic = keyof typeof ClientMessageSchemas
/** Each JSON topic's body, as its schema parses it. */
export type ClientMessages = { [K in JsonTopic]: z.infer<(typeof ClientMessageSchemas)[K]> }
type ClientBody<K extends JsonTopic> = z.input<(typeof ClientMessageSchemas)[K]>
/** A topic and a body its schema accepts, which may be left out when an empty body will do. */
export type ClientSend<K extends JsonTopic> =
  Record<string, never> extends ClientBody<K> ? [topic: K, body?: ClientBody<K>] : [topic: K, body: ClientBody<K>]

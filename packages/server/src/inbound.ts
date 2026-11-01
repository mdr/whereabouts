import { type z } from "zod"
import {
  ClientMessageSchemas,
  type ClientMessages,
  type ClientTopic
} from "@whereabouts/shared/protocol/client-messages"
import { decodeMessage } from "@whereabouts/shared/protocol/server-messages"
import type { PaintSubmission } from "@whereabouts/shared/protocol/views"
import { decodePaint } from "@whereabouts/shared/paint/paint-wire"

// The schemas seen as a mapped type, so indexing with a generic topic gives
// that topic's body rather than a union of all of them.
const schemas: { [K in ClientTopic]: z.ZodType<ClientMessages[K]> } = ClientMessageSchemas

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string }

export const readJson = <K extends ClientTopic>(topic: K, payload: Uint8Array): Parsed<ClientMessages[K]> => {
  let body: unknown
  try {
    body = decodeMessage(payload)
  } catch {
    return { ok: false, error: "malformed message" }
  }
  const parsed = schemas[topic].safeParse(body)
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: `invalid ${topic}` }
}

export const readPaint = (payload: Uint8Array): Parsed<PaintSubmission> => {
  const paint = decodePaint(payload)
  return paint ? { ok: true, data: paint } : { ok: false, error: "invalid paint" }
}

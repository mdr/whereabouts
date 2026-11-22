/** Batches of a browser's log and analytics records, which the server writes to its own log. */
import { z } from "zod"
import { WEB_CODES } from "../telemetry/web-codes.ts"

export const CLIENT_TELEMETRY_PATH = "/api/client-telemetry"

export enum TelemetryLevel {
  ERROR = "ERROR",
  WARN = "WARN",
  INFO = "INFO",
  DEBUG = "DEBUG"
}

export const MAX_RECORDS_PER_BATCH = 50
export const MAX_FIELDS = 12
const MAX_TEXT_LENGTH = 100
export const MAX_MSG_LENGTH = 200

const FieldValueSchema = z.union([z.string().max(MAX_TEXT_LENGTH), z.number(), z.boolean()])
export type FieldValue = z.infer<typeof FieldValueSchema>

const TelemetryRecordSchema = z.strictObject({
  /** The browser's clock, so records keep their order and spacing once batched. */
  at: z.number().int().nonnegative(),
  level: z.enum(TelemetryLevel),
  code: z.enum(WEB_CODES),
  msg: z.string().max(MAX_MSG_LENGTH),
  fields: z
    .record(z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/), FieldValueSchema)
    .refine((fields) => Object.keys(fields).length <= MAX_FIELDS, `at most ${MAX_FIELDS} fields`),
  /** The route, without its query. */
  screen: z.string().max(MAX_TEXT_LENGTH),
  room: z.string().max(10).optional(),
  playerId: z.string().max(20).optional()
})

export type TelemetryRecord = z.infer<typeof TelemetryRecordSchema>

export const TelemetryBatchSchema = z.strictObject({
  /** Made afresh on each page load: ties one tab's records together, and nothing else. */
  session: z.string().max(40),
  build: z.string().max(100),
  records: z.array(TelemetryRecordSchema).min(1).max(MAX_RECORDS_PER_BATCH)
})

export type TelemetryBatch = z.infer<typeof TelemetryBatchSchema>

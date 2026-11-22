import type { Clock } from "@whereabouts/shared/clock"
import {
  MAX_FIELDS,
  MAX_MSG_LENGTH,
  TelemetryLevel,
  type FieldValue,
  type TelemetryBatch,
  type TelemetryRecord
} from "@whereabouts/shared/protocol/client-telemetry"
import type { Ms } from "@whereabouts/shared/units"
import type { LogEntry, LogSink } from "./logger"

/** Where the tab is when a record is written. */
export interface RecordContext {
  screen: string
  room?: string
  playerId?: string
}

export interface ShipperOptions {
  clock: Clock
  session: string
  build: string
  context: () => RecordContext
  send: (batch: TelemetryBatch) => void
}

/** Long enough that a burst of actions goes as one request, short enough that a closed tab loses little. */
export const FLUSH_DELAY: Ms = 5_000
/** Within MAX_RECORDS_PER_BATCH, so one flush is one batch. */
export const FLUSH_AT = 25
const MAX_TEXT_LENGTH = 100
const FIELD_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/

const clipped = (fields: Record<string, FieldValue>): Record<string, FieldValue> =>
  Object.fromEntries(
    Object.entries(fields)
      .filter(([name]) => FIELD_NAME.test(name))
      .slice(0, MAX_FIELDS)
      .map(([name, value]) => [name, typeof value === "string" ? value.slice(0, MAX_TEXT_LENGTH) : value])
  )

/** Sends a tab's records to the server in batches; DEBUG stays in the console. */
export class TelemetryShipper {
  readonly #options: ShipperOptions
  #queue: TelemetryRecord[] = []
  #timer: unknown = undefined

  constructor(options: ShipperOptions) {
    this.#options = options
  }

  readonly sink: LogSink = (entry: LogEntry): void => {
    if (entry.level === TelemetryLevel.DEBUG) return
    const { screen, room, playerId } = this.#options.context()
    this.#queue.push({
      at: entry.at,
      level: entry.level,
      code: entry.code,
      msg: entry.msg.slice(0, MAX_MSG_LENGTH),
      fields: clipped(entry.fields),
      screen: screen.slice(0, MAX_TEXT_LENGTH),
      ...(room ? { room } : {}),
      ...(playerId ? { playerId } : {})
    })
    if (this.#queue.length >= FLUSH_AT) this.flush()
    else this.#timer ??= this.#options.clock.setTimeout(() => this.flush(), FLUSH_DELAY)
  }

  /** Send everything queued now, as when the tab is hidden or closed. */
  flush(): void {
    if (this.#timer !== undefined) this.#options.clock.clearTimeout(this.#timer)
    this.#timer = undefined
    const { session, build, send } = this.#options
    if (this.#queue.length === 0) return
    const records = this.#queue
    this.#queue = []
    try {
      send({ session, build, records })
    } catch {
      // A failure to send is dropped, as a client error report is.
    }
  }
}

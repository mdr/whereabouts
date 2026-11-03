import type { Logger } from "pino"

/** The stable `event` field of a log line, for searching logs by what happened. */
export enum LogEvent {
  SERVER_STARTED = "SERVER_STARTED",
  SERVER_STOPPING = "SERVER_STOPPING",
  REQUEST = "REQUEST",
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  RATE_LIMITED = "RATE_LIMITED",
  BAD_MESSAGE = "BAD_MESSAGE",
  SERVER_ERROR = "SERVER_ERROR",
  ROOM_OPENED = "ROOM_OPENED",
  ROOM_CLOSED = "ROOM_CLOSED",
  PLAYER_JOINED = "PLAYER_JOINED",
  PLAYER_LEFT = "PLAYER_LEFT",
  PLAYER_TURNED_AWAY = "PLAYER_TURNED_AWAY",
  PLAYER_REMOVED = "PLAYER_REMOVED",
  GAME_STARTED = "GAME_STARTED",
  ROUND_STARTED = "ROUND_STARTED",
  ROUND_REVEALED = "ROUND_REVEALED",
  GAME_ENDED = "GAME_ENDED",
  CLIENT_ERROR = "CLIENT_ERROR",
  CLIENT_ERROR_RATE_LIMITED = "CLIENT_ERROR_RATE_LIMITED"
}

export type LogLevel = "info" | "warn" | "error"

/** Log one event as a JSON line: `event` and the fields, with the event also as the message. */
export const logEvent = (
  logger: Logger,
  event: LogEvent,
  fields: Record<string, unknown> = {},
  level: LogLevel = "info"
): void => {
  logger[level]({ event, ...fields }, event)
}

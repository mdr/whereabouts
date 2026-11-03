/** The `code` of each log line, for searching logs by what happened: `LOG_CODES.group.event`, valued "group.event". */
export const LOG_CODES = {
  server: { started: "server.started", stopping: "server.stopping", error: "server.error" },
  request: { completed: "request.completed" },
  connection: {
    refused: "connection.refused",
    rateLimited: "connection.rateLimited",
    badMessage: "connection.badMessage"
  },
  room: { opened: "room.opened", closed: "room.closed" },
  player: { joined: "player.joined", left: "player.left", turnedAway: "player.turnedAway", removed: "player.removed" },
  game: { started: "game.started", ended: "game.ended" },
  round: { started: "round.started", revealed: "round.revealed" },
  clientError: { reported: "clientError.reported", rateLimited: "clientError.rateLimited" }
} as const

type LogCodes = typeof LOG_CODES

/** Any one code: "server.started" | "player.joined" | … */
export type LogCode = { [Group in keyof LogCodes]: LogCodes[Group][keyof LogCodes[Group]] }[keyof LogCodes]

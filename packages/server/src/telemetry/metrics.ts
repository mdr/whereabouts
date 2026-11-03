import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client"
import type { Game } from "@whereabouts/shared/game/game"

/** Why a server-side failure was counted. */
export enum ServerErrorKind {
  TICK_THREW = "TICK_THREW",
  REQUEST_FAILED = "REQUEST_FAILED",
  HANDLE_MESSAGE_REJECTED = "HANDLE_MESSAGE_REJECTED"
}

/** Why a connection was refused or closed, besides the reasons a game gives (CloseReason). */
export enum RefusalReason {
  ADDRESS_TOO_MANY_OPEN = "ADDRESS_TOO_MANY_OPEN",
  ADDRESS_TOO_FAST = "ADDRESS_TOO_FAST",
  MESSAGE_RATE_LIMIT = "MESSAGE_RATE_LIMIT"
}

/** How a server error's kind reads in logs and metric labels. */
export const SERVER_ERROR_KIND_TEXT: Record<ServerErrorKind, string> = {
  [ServerErrorKind.TICK_THREW]: "tickThrew",
  [ServerErrorKind.REQUEST_FAILED]: "requestFailed",
  [ServerErrorKind.HANDLE_MESSAGE_REJECTED]: "handleMessageRejected"
}

/** How a refusal's reason reads in logs and metric labels. */
export const REFUSAL_REASON_TEXT: Record<RefusalReason, string> = {
  [RefusalReason.ADDRESS_TOO_MANY_OPEN]: "addressTooManyOpen",
  [RefusalReason.ADDRESS_TOO_FAST]: "addressTooFast",
  [RefusalReason.MESSAGE_RATE_LIMIT]: "messageRateLimit"
}

/**
 * The app's own registry, not prom-client's global one, so apps made side by
 * side (in tests) do not share counters. Gauges are read from the games when
 * scraped. Add a counter to `registry` to count something new.
 */
export class Metrics {
  readonly registry = new Registry()
  readonly gamesStarted: Counter
  readonly gamesEnded: Counter<"completed">
  readonly rounds: Counter<"type">
  readonly playerJoins: Counter<"rejoined">
  readonly connectionsRefused: Counter<"reason">
  readonly serverErrors: Counter<"kind">
  readonly clientErrors: Counter<"kind">
  readonly buildInfo: Gauge<"build">

  constructor(games: () => Game[]) {
    const { registry } = this
    collectDefaultMetrics({ register: registry })
    new Gauge({
      name: "whereabouts_rooms_open",
      help: "Games that exist, in any phase.",
      registers: [registry],
      collect() {
        this.set(games().length)
      }
    })
    new Gauge({
      name: "whereabouts_players_connected",
      help: "Connected players, not counting spectators.",
      registers: [registry],
      collect() {
        this.set(games().reduce((sum, game) => sum + game.connectedCounts.players, 0))
      }
    })
    new Gauge({
      name: "whereabouts_spectators_connected",
      help: "Connected spectators.",
      registers: [registry],
      collect() {
        this.set(games().reduce((sum, game) => sum + game.connectedCounts.spectators, 0))
      }
    })
    this.gamesStarted = new Counter({
      name: "whereabouts_games_started_total",
      help: "Games started.",
      registers: [registry]
    })
    this.gamesEnded = new Counter({
      name: "whereabouts_games_ended_total",
      help: "Games ended, played to the end or not.",
      labelNames: ["completed"],
      registers: [registry]
    })
    this.rounds = new Counter({
      name: "whereabouts_rounds_total",
      help: "Rounds started, by question type.",
      labelNames: ["type"],
      registers: [registry]
    })
    this.playerJoins = new Counter({
      name: "whereabouts_player_joins_total",
      help: "Players let into a game, new or returning.",
      labelNames: ["rejoined"],
      registers: [registry]
    })
    this.connectionsRefused = new Counter({
      name: "whereabouts_connections_refused_total",
      help: "Connections refused or turned away, by reason.",
      labelNames: ["reason"],
      registers: [registry]
    })
    this.serverErrors = new Counter({
      name: "whereabouts_server_errors_total",
      help: "Failures inside the server that a player did not cause.",
      labelNames: ["kind"],
      registers: [registry]
    })
    this.buildInfo = new Gauge({
      name: "whereabouts_build_info",
      help: "1, labelled with the commit the server was built from.",
      labelNames: ["build"],
      registers: [registry]
    })
    this.clientErrors = new Counter({
      name: "whereabouts_client_errors_total",
      help: "Failures players' browsers reported, counted before the log's rate limits.",
      labelNames: ["kind"],
      registers: [registry]
    })
  }
}

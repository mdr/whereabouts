import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client"
import type { CloseReason } from "@whereabouts/shared/close-reason"
import type { Game } from "@whereabouts/shared/game/game"
import type { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import type { QuestionType } from "@whereabouts/shared/questions"
import type { Ms } from "@whereabouts/shared/units"
import { CLOSE_REASON_LABEL } from "./close-reason-text.ts"
import {
  CLIENT_ERROR_KIND_LABEL,
  CLIENT_ERROR_LIMIT_LABEL,
  GAME_OUTCOME_LABEL,
  JOIN_KIND_LABEL,
  QUESTION_TYPE_LABEL,
  type ClientErrorLimit,
  type GameOutcome,
  type JoinKind
} from "./metric-labels.ts"

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

/** How a server error's kind reads in logs. */
export const SERVER_ERROR_KIND_TEXT: Record<ServerErrorKind, string> = {
  [ServerErrorKind.TICK_THREW]: "tickThrew",
  [ServerErrorKind.REQUEST_FAILED]: "requestFailed",
  [ServerErrorKind.HANDLE_MESSAGE_REJECTED]: "handleMessageRejected"
}

/** How a server error's kind reads as a metric label value. */
const SERVER_ERROR_KIND_LABEL: Record<ServerErrorKind, string> = {
  [ServerErrorKind.TICK_THREW]: "tick_threw",
  [ServerErrorKind.REQUEST_FAILED]: "request_failed",
  [ServerErrorKind.HANDLE_MESSAGE_REJECTED]: "handle_message_rejected"
}

/** How a refusal's reason reads in logs. */
export const REFUSAL_REASON_TEXT: Record<RefusalReason, string> = {
  [RefusalReason.ADDRESS_TOO_MANY_OPEN]: "addressTooManyOpen",
  [RefusalReason.ADDRESS_TOO_FAST]: "addressTooFast",
  [RefusalReason.MESSAGE_RATE_LIMIT]: "messageRateLimit"
}

/** How a refusal's reason reads as a metric label value. */
const REFUSAL_REASON_LABEL: Record<RefusalReason, string> = {
  [RefusalReason.ADDRESS_TOO_MANY_OPEN]: "address_too_many_open",
  [RefusalReason.ADDRESS_TOO_FAST]: "address_too_fast",
  [RefusalReason.MESSAGE_RATE_LIMIT]: "message_rate_limit"
}

const GAME_SECONDS_BUCKETS = [60, 120, 300, 600, 900, 1200, 1800, 3600]
const ROOM_SECONDS_BUCKETS = [10, 30, ...GAME_SECONDS_BUCKETS]
const PLAYER_COUNT_BUCKETS = [1, 2, 3, 4, 6, 8, 12, 16, 24]

const secondsOf = (ms: Ms): number => ms / 1000

/**
 * The app's own registry, not prom-client's global one, so apps made side by
 * side (in tests) do not share counters. Gauges are read from the games when
 * scraped. Add a metric to `registry` to count something new: `whereabouts_`
 * snake_case, base units, `_total` on counters; labels and their values
 * snake_case from a small fixed set.
 */
export class Metrics {
  readonly registry = new Registry()
  readonly buildInfo: Gauge<"build">
  private readonly gamesStarted: Counter
  private readonly gamesEnded: Counter<"outcome">
  private readonly rounds: Counter<"question_type">
  private readonly playerJoins: Counter<"kind">
  private readonly connectionsRefused: Counter<"reason">
  private readonly serverErrors: Counter<"kind">
  private readonly clientErrors: Counter<"kind">
  private readonly clientErrorsDropped: Counter<"limit">
  private readonly gameDuration: Histogram
  private readonly roomLifetime: Histogram
  private readonly playersPerGame: Histogram

  constructor(games: () => Game[]) {
    const { registry } = this
    collectDefaultMetrics({ register: registry })
    new Gauge({
      name: "whereabouts_rooms_open",
      help: "Rooms that exist right now (one unit is a room), in any phase.",
      registers: [registry],
      collect() {
        this.set(games().length)
      }
    })
    new Gauge({
      name: "whereabouts_players_connected",
      help: "Players connected right now (one unit is a player), not counting spectators.",
      registers: [registry],
      collect() {
        this.set(games().reduce((sum, game) => sum + game.connectedCounts.players, 0))
      }
    })
    new Gauge({
      name: "whereabouts_spectators_connected",
      help: "Spectators connected right now (one unit is a spectator).",
      registers: [registry],
      collect() {
        this.set(games().reduce((sum, game) => sum + game.connectedCounts.spectators, 0))
      }
    })
    this.gamesStarted = new Counter({
      name: "whereabouts_games_started_total",
      help: "Games started (one unit is a game).",
      registers: [registry]
    })
    this.gamesEnded = new Counter({
      name: "whereabouts_games_ended_total",
      help: "Games ended (one unit is a game), by outcome: played to the end, or ended early.",
      labelNames: ["outcome"],
      registers: [registry]
    })
    this.rounds = new Counter({
      name: "whereabouts_rounds_total",
      help: "Rounds started (one unit is a round), by question type.",
      labelNames: ["question_type"],
      registers: [registry]
    })
    this.playerJoins = new Counter({
      name: "whereabouts_player_joins_total",
      help: "Players let into a game (one unit is a join), by whether they were new or rejoined.",
      labelNames: ["kind"],
      registers: [registry]
    })
    this.connectionsRefused = new Counter({
      name: "whereabouts_connections_refused_total",
      help: "Connections refused or turned away (one unit is a connection), by reason.",
      labelNames: ["reason"],
      registers: [registry]
    })
    this.serverErrors = new Counter({
      name: "whereabouts_server_errors_total",
      help: "Failures inside the server that a player did not cause (one unit is a failure), by kind.",
      labelNames: ["kind"],
      registers: [registry]
    })
    this.buildInfo = new Gauge({
      name: "whereabouts_build_info",
      help: "Always 1, labelled with the commit the server was built from.",
      labelNames: ["build"],
      registers: [registry]
    })
    this.clientErrors = new Counter({
      name: "whereabouts_client_errors_total",
      help: "Valid failure reports from players' browsers (one unit is a report), by kind, whether or not the log keeps them.",
      labelNames: ["kind"],
      registers: [registry]
    })
    this.clientErrorsDropped = new Counter({
      name: "whereabouts_client_errors_dropped_total",
      help: "Valid failure reports left out of the log by a rate limit (one unit is a report), by limit.",
      labelNames: ["limit"],
      registers: [registry]
    })
    this.gameDuration = new Histogram({
      name: "whereabouts_game_duration_seconds",
      help: "Seconds from a game starting to it ending, finished or not.",
      buckets: GAME_SECONDS_BUCKETS,
      registers: [registry]
    })
    this.roomLifetime = new Histogram({
      name: "whereabouts_room_lifetime_seconds",
      help: "Seconds from a room opening to it closing.",
      buckets: ROOM_SECONDS_BUCKETS,
      registers: [registry]
    })
    this.playersPerGame = new Histogram({
      name: "whereabouts_players_per_game",
      help: "Players in a game when it started (one unit is a player), not counting spectators.",
      buckets: PLAYER_COUNT_BUCKETS,
      registers: [registry]
    })
  }

  countGameStarted(playerCount: number): void {
    this.gamesStarted.inc()
    this.playersPerGame.observe(playerCount)
  }

  /** `duration` is how long the game ran, when the room saw it start. */
  countGameEnded(outcome: GameOutcome, duration: Ms | undefined): void {
    this.gamesEnded.inc({ outcome: GAME_OUTCOME_LABEL[outcome] })
    if (duration !== undefined) this.gameDuration.observe(secondsOf(duration))
  }

  countRound(type: QuestionType): void {
    this.rounds.inc({ question_type: QUESTION_TYPE_LABEL[type] })
  }

  countPlayerJoin(kind: JoinKind): void {
    this.playerJoins.inc({ kind: JOIN_KIND_LABEL[kind] })
  }

  countRefusal(reason: RefusalReason): void {
    this.connectionsRefused.inc({ reason: REFUSAL_REASON_LABEL[reason] })
  }

  countTurnedAway(reason: CloseReason): void {
    this.connectionsRefused.inc({ reason: CLOSE_REASON_LABEL[reason] })
  }

  countServerError(kind: ServerErrorKind): void {
    this.serverErrors.inc({ kind: SERVER_ERROR_KIND_LABEL[kind] })
  }

  countClientError(kind: ClientErrorKind): void {
    this.clientErrors.inc({ kind: CLIENT_ERROR_KIND_LABEL[kind] })
  }

  countClientErrorDropped(limit: ClientErrorLimit): void {
    this.clientErrorsDropped.inc({ limit: CLIENT_ERROR_LIMIT_LABEL[limit] })
  }

  observeRoomLifetime(lifetime: Ms): void {
    this.roomLifetime.observe(secondsOf(lifetime))
  }
}

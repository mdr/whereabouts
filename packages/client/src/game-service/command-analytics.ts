import type { ConfigurePatch } from "@whereabouts/shared/protocol/config"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { PlayerId } from "@whereabouts/shared/ids"
import type { Role } from "@whereabouts/shared/roles"
import { ANALYTICS_CODES, WEB_LOG_CODES } from "@whereabouts/shared/telemetry/web-codes"
import type { Telemetry } from "../telemetry/telemetry"
import { ConfigureOrigin } from "./game-service"

/** The game commands a player gives, as analytics, for the online and practice services alike. */
export class CommandAnalytics {
  readonly #telemetry: Pick<Telemetry, "analytics" | "logger">

  constructor(telemetry: Pick<Telemetry, "analytics" | "logger">) {
    this.#telemetry = telemetry
  }

  /** `online`: whether the command could reach the server when given. */
  lock(online: boolean): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.guess.lockedIn, "pressed Done", { online })
  }
  unlock(online: boolean): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.guess.unlocked, "pressed Keep editing", { online })
  }
  ready(): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.reveal.readied, "pressed Ready")
  }
  configure(patch: ConfigurePatch, origin: ConfigureOrigin): void {
    const settings = Object.keys(patch).sort().join(",")
    if (origin === ConfigureOrigin.SAVED)
      this.#telemetry.logger.info(WEB_LOG_CODES.setup.restored, "put back the host's last setup", { settings })
    else this.#telemetry.analytics.track(ANALYTICS_CODES.setup.changed, "changed the setup", { settings })
  }
  start(): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.host.gameStarted, "started the game")
  }
  next(): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.host.roundAdvanced, "moved on a round")
  }
  again(): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.host.gameRestarted, "played again")
  }
  rename(): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.seat.renamed, "renamed themselves")
  }
  hint(axis: HintAxis): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.hint.taken, "took a hint", { axis })
  }
  kick(playerId: PlayerId): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.host.playerKicked, "removed a player", { targetPlayerId: playerId })
  }
  leave(): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.seat.left, "left the game")
  }
  setRole(role: Role): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.seat.roleChanged, "changed role", { role })
  }
  makeHost(playerId: PlayerId): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.host.hostHandedOver, "handed over host", {
      targetPlayerId: playerId
    })
  }
  end(): void {
    this.#telemetry.analytics.track(ANALYTICS_CODES.host.gameEnded, "ended the game")
  }
}

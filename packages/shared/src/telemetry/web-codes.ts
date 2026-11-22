/**
 * The `code` of each web record, `CODES.group.event`, valued "group.event".
 * Logs say what happens to the app; analytics say what a player does.
 */
export const WEB_LOG_CODES = {
  app: { started: "app.started" },
  map: { created: "map.created" },
  paint: { reset: "paint.reset", restored: "paint.restored" },
  connection: { changed: "connection.changed" }
} as const

export const ANALYTICS_CODES = {
  nav: { screenOpened: "nav.screenOpened" },
  guess: { lockedIn: "guess.lockedIn", unlocked: "guess.unlocked" },
  hint: { taken: "hint.taken" },
  reveal: { readied: "reveal.readied" },
  setup: { changed: "setup.changed", presetChosen: "setup.presetChosen" },
  host: {
    gameStarted: "host.gameStarted",
    roundAdvanced: "host.roundAdvanced",
    gameRestarted: "host.gameRestarted",
    gameEnded: "host.gameEnded",
    playerKicked: "host.playerKicked",
    hostHandedOver: "host.hostHandedOver"
  },
  seat: { renamed: "seat.renamed", left: "seat.left", roleChanged: "seat.roleChanged" },
  paint: {
    toolChosen: "paint.toolChosen",
    cleared: "paint.cleared",
    trimmed: "paint.trimmed",
    undone: "paint.undone",
    redone: "paint.redone",
    filled: "paint.filled"
  },
  invite: { linkCopied: "invite.linkCopied", shared: "invite.shared" },
  picture: { enlarged: "picture.enlarged" },
  vr: { entered: "vr.entered" },
  settings: { changed: "settings.changed" }
} as const

type CodesOf<Registry> = {
  [Group in keyof Registry]: Registry[Group][keyof Registry[Group]]
}[keyof Registry]

/** "app.started" | "paint.reset" | … */
export type WebLogCode = CodesOf<typeof WEB_LOG_CODES>
/** "paint.cleared" | "nav.screenOpened" | … */
export type AnalyticsCode = CodesOf<typeof ANALYTICS_CODES>
export type WebCode = WebLogCode | AnalyticsCode

const codesOf = (registry: Record<string, Record<string, string>>): string[] =>
  Object.values(registry).flatMap((codes) => Object.values(codes))

export const WEB_CODES = [...codesOf(WEB_LOG_CODES), ...codesOf(ANALYTICS_CODES)] as [WebCode, ...WebCode[]]

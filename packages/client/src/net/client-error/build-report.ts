import {
  ClientErrorKind,
  MAX_BUILD_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_ROOM_LENGTH,
  MAX_SCREEN_LENGTH,
  MAX_STACK_LENGTH,
  type ClientErrorReport
} from "@whereabouts/shared/protocol/client-error"

export interface PageContext {
  /** location.hash */
  hash: string
  /** The src of every script on the page. */
  scripts: string[]
}

/** Drops the query and fragment from every URL in the text, which could carry a token. */
export const scrubUrls = (text: string): string => text.replace(/(https?:\/\/[^\s?#"')]+)[?#][^\s"')]*/g, "$1")

/** A route such as "/game/ABCD", without its query. */
const screenOf = (hash: string): string => hash.replace(/^#/, "").replace(/\?.*$/, "") || "/"

const roomOf = (screen: string): string | undefined => /^\/game\/(?:new\/)?([A-Z0-9]{4,6})$/i.exec(screen)?.[1]

/** The bundle's hashed file name (index-abc123.js); undefined on the dev server. */
const buildOf = (scripts: string[]): string | undefined =>
  scripts.map((src) => /\/assets\/([^/?#]+\.js)(?:[?#]|$)/.exec(src)?.[1]).find((name) => name !== undefined)

const describeError = (error: unknown): { message: string; stack: string | undefined } => {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack }
  return { message: typeof error === "string" ? error : "non-error thrown", stack: undefined }
}

export const buildReport = (kind: ClientErrorKind, error: unknown, page: PageContext): ClientErrorReport => {
  const { message, stack } = describeError(error)
  const screen = screenOf(page.hash)
  const build = buildOf(page.scripts)
  const room = roomOf(screen)
  return {
    kind,
    message: scrubUrls(message).slice(0, MAX_MESSAGE_LENGTH),
    ...(stack ? { stack: scrubUrls(stack).slice(0, MAX_STACK_LENGTH) } : {}),
    screen: screen.slice(0, MAX_SCREEN_LENGTH),
    ...(build ? { build: build.slice(0, MAX_BUILD_LENGTH) } : {}),
    ...(room ? { room: room.toUpperCase().slice(0, MAX_ROOM_LENGTH) } : {})
  }
}

/** A map that cannot start for want of WebGL is the player's browser, not the network. */
export const mapFailureKind = (error: unknown): ClientErrorKind =>
  /webgl/i.test(describeError(error).message) ? ClientErrorKind.WEBGL : ClientErrorKind.MAP_LOAD

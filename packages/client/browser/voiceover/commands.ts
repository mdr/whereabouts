/** What a VoiceOver session can be told to do, one per input line. */
export enum CommandType {
  NEXT = "NEXT",
  PREVIOUS = "PREVIOUS",
  NEXT_HEADING = "NEXT_HEADING",
  NEXT_LANDMARK = "NEXT_LANDMARK",
  ACT = "ACT",
  PRESS = "PRESS",
  TYPE = "TYPE",
  OPEN = "OPEN",
  SEAT = "SEAT",
  ITEM = "ITEM"
}

export type Command =
  | { type: CommandType.NEXT; times: number }
  | { type: CommandType.PREVIOUS; times: number }
  | { type: CommandType.NEXT_HEADING }
  | { type: CommandType.NEXT_LANDMARK }
  | { type: CommandType.ACT }
  | { type: CommandType.PRESS; keys: string[] }
  | { type: CommandType.TYPE; text: string }
  | { type: CommandType.OPEN; route: string }
  | { type: CommandType.SEAT; names: string[] }
  | { type: CommandType.ITEM }

const COMMAND_HELP = `Commands, one per line (blank lines and lines starting # are skipped):
  next [n]          VoiceOver to the next item (VO-Right), n times
  previous [n]      VoiceOver to the previous item (VO-Left)
  heading           next heading (VO-Command-H)
  landmark          next landmark
  act               press the item under the VoiceOver cursor (VO-Space)
  press <keys...>   keys, in turn, e.g. "press Tab Tab", "press Shift+Tab", "press Escape"
  type <text>       type text into whatever has focus
  open <route>      load a route, e.g. "open /", "open /solo"
  seat <names...>   seat players with no tab behind them in the hosted game
  item              what VoiceOver says about the current item again`

const count = (argument: string | undefined): number | undefined => {
  if (argument === undefined) return 1
  const times = Number(argument)
  return Number.isInteger(times) && times > 0 ? times : undefined
}

/** The command a line asks for, or undefined if it asks for none. */
export const parseCommand = (line: string): Command | undefined => {
  const [word, ...rest] = line.trim().split(/\s+/)
  switch ((word ?? "").toLowerCase()) {
    case "next": {
      const times = count(rest[0])
      return times === undefined ? undefined : { type: CommandType.NEXT, times }
    }
    case "previous": {
      const times = count(rest[0])
      return times === undefined ? undefined : { type: CommandType.PREVIOUS, times }
    }
    case "heading":
      return { type: CommandType.NEXT_HEADING }
    case "landmark":
      return { type: CommandType.NEXT_LANDMARK }
    case "act":
      return { type: CommandType.ACT }
    case "press":
      return rest.length > 0 ? { type: CommandType.PRESS, keys: rest } : undefined
    case "type": {
      const text = line.trim().slice("type".length).trim()
      return text ? { type: CommandType.TYPE, text } : undefined
    }
    case "open":
      return rest[0]?.startsWith("/") ? { type: CommandType.OPEN, route: rest[0] } : undefined
    case "seat":
      return rest.length > 0 ? { type: CommandType.SEAT, names: rest } : undefined
    case "item":
      return { type: CommandType.ITEM }
    default:
      return undefined
  }
}

export interface ScriptStep {
  line: string
  command: Command
}

/** A script's steps, skipping blank lines and # comments; throws naming every line it can't read. */
export const parseScript = (text: string): ScriptStep[] => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
  const steps = lines.map((line) => ({ line, command: parseCommand(line) }))
  const unread = steps.filter(({ command }) => command === undefined).map(({ line }) => `  ${line}`)
  if (unread.length > 0) throw new Error(`Lines it can't read:\n${unread.join("\n")}\n\n${COMMAND_HELP}`)
  return steps as ScriptStep[]
}

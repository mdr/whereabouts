/**
 * Every keyboard shortcut, in one table: the help card lists it, and the
 * handlers match keys against it, so the two can't disagree. The paint
 * keys also say what they do; the rest act where they belong (holding
 * Space in PaintInput, Enter in practice, ? and Esc in the card).
 */
import { Tool } from "../paint/tool"

export type KeyPress = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">

/** What the paint keys act on. */
export interface PaintKeyTarget {
  /** Painting is on: the paint keys do nothing otherwise. */
  enabled(): boolean
  setTool(tool: Tool): void
  canFill(): boolean
  /** Scale the brush by `factor`. */
  resizeBrush(factor: number): void
  undo(): void
  redo(): void
}

export interface Combo {
  /** The keys as the card shows them. */
  keys: string[]
  matches(event: KeyPress): boolean
  /** A paint key's action. */
  run?: (target: PaintKeyTarget) => void
  /** Works, but left off the card. */
  unlisted?: boolean
}

export interface Shortcut {
  action: string
  combos: Combo[]
  /** Whether the combos are one per action ("/") or alternatives ("or"). */
  sep?: "/" | "or"
  /** Listed only in practice, where it works. */
  practiceOnly?: boolean
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
const MOD = isMac ? "⌘" : "Ctrl"

const withMod = (event: KeyPress) => event.metaKey || event.ctrlKey
const plain = (key: string) => (event: KeyPress) => event.key === key

const paintKey = (key: string, run: (target: PaintKeyTarget) => void): Combo => ({
  keys: [key],
  matches: plain(key),
  run
})

const BRUSH_STEP = 1.25

export const PAN_HOLD: Combo = { keys: ["Space"], matches: (event) => event.code === "Space" }
export const SUBMIT: Combo = { keys: ["Enter"], matches: plain("Enter") }
export const CLOSE: Combo = { keys: ["Esc"], matches: plain("Escape") }
export const TOGGLE_LIST: Combo = {
  keys: ["?"],
  matches: (event) => event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey
}

const SHORTCUTS: Shortcut[] = [
  {
    action: "Pan / Paint / Erase / Fill",
    sep: "/",
    combos: [
      paintKey("1", (target) => target.setTool(Tool.PAN)),
      paintKey("2", (target) => target.setTool(Tool.PAINT)),
      paintKey("3", (target) => target.setTool(Tool.ERASE)),
      paintKey("4", (target) => {
        if (target.canFill()) target.setTool(Tool.FILL)
      })
    ]
  },
  { action: "Pan while painting", sep: "or", combos: [PAN_HOLD, { keys: ["Middle-drag"], matches: () => false }] },
  {
    action: "Brush smaller / larger",
    sep: "/",
    combos: [
      paintKey("[", (target) => target.resizeBrush(1 / BRUSH_STEP)),
      paintKey("]", (target) => target.resizeBrush(BRUSH_STEP))
    ]
  },
  {
    action: "Undo",
    combos: [
      {
        keys: [MOD, "Z"],
        matches: (event) => withMod(event) && !event.shiftKey && event.key.toLowerCase() === "z",
        run: (target) => target.undo()
      }
    ]
  },
  {
    action: "Redo",
    sep: "or",
    combos: [
      {
        keys: [MOD, isMac ? "⇧" : "Shift", "Z"],
        matches: (event) => withMod(event) && event.shiftKey && event.key.toLowerCase() === "z",
        run: (target) => target.redo()
      },
      {
        keys: ["Ctrl", "Y"],
        matches: (event) => withMod(event) && event.key.toLowerCase() === "y",
        run: (target) => target.redo(),
        unlisted: isMac
      }
    ]
  },
  { action: "Submit / next question", combos: [SUBMIT], practiceOnly: true },
  { action: "Enlarged photo back", combos: [CLOSE] },
  { action: "These shortcuts", combos: [TOGGLE_LIST] }
]

/** The card's rows: in practice, or in a game. */
export const listedShortcuts = (practice: boolean): Shortcut[] =>
  SHORTCUTS.filter((shortcut) => practice || !shortcut.practiceOnly).map((shortcut) => ({
    ...shortcut,
    combos: shortcut.combos.filter((combo) => !combo.unlisted)
  }))

/** Run the paint key `e` presses, if painting is on; whether it was one. */
export const runPaintKey = (event: KeyPress, target: PaintKeyTarget): boolean => {
  if (!target.enabled()) return false
  for (const shortcut of SHORTCUTS)
    for (const combo of shortcut.combos)
      if (combo.run && combo.matches(event)) {
        combo.run(target)
        return true
      }
  return false
}

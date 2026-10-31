/**
 * Every keyboard shortcut, in one table: the help card lists it, and the
 * handlers match keys against it, so the two can't disagree. The paint
 * keys also say what they do; the rest act where they belong (holding
 * Space in PaintInput, Enter in practice, ? and Esc in the card).
 */
import { Tool } from "./tool"

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
  matches(e: KeyPress): boolean
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

const withMod = (e: KeyPress) => e.metaKey || e.ctrlKey
const plain = (key: string) => (e: KeyPress) => e.key === key

function paintKey(key: string, run: (t: PaintKeyTarget) => void): Combo {
  return { keys: [key], matches: plain(key), run }
}

const BRUSH_STEP = 1.25

export const PAN_HOLD: Combo = { keys: ["Space"], matches: (e) => e.code === "Space" }
export const SUBMIT: Combo = { keys: ["Enter"], matches: plain("Enter") }
export const CLOSE: Combo = { keys: ["Esc"], matches: plain("Escape") }
export const TOGGLE_LIST: Combo = {
  keys: ["?"],
  matches: (e) => e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey
}

const SHORTCUTS: Shortcut[] = [
  {
    action: "Pan / Paint / Erase / Fill",
    sep: "/",
    combos: [
      paintKey("1", (t) => t.setTool(Tool.PAN)),
      paintKey("2", (t) => t.setTool(Tool.PAINT)),
      paintKey("3", (t) => t.setTool(Tool.ERASE)),
      paintKey("4", (t) => {
        if (t.canFill()) t.setTool(Tool.FILL)
      })
    ]
  },
  { action: "Pan while painting", sep: "or", combos: [PAN_HOLD, { keys: ["Middle-drag"], matches: () => false }] },
  {
    action: "Brush smaller / larger",
    sep: "/",
    combos: [paintKey("[", (t) => t.resizeBrush(1 / BRUSH_STEP)), paintKey("]", (t) => t.resizeBrush(BRUSH_STEP))]
  },
  {
    action: "Undo",
    combos: [
      {
        keys: [MOD, "Z"],
        matches: (e) => withMod(e) && !e.shiftKey && e.key.toLowerCase() === "z",
        run: (t) => t.undo()
      }
    ]
  },
  {
    action: "Redo",
    sep: "or",
    combos: [
      {
        keys: [MOD, isMac ? "⇧" : "Shift", "Z"],
        matches: (e) => withMod(e) && e.shiftKey && e.key.toLowerCase() === "z",
        run: (t) => t.redo()
      },
      {
        keys: ["Ctrl", "Y"],
        matches: (e) => withMod(e) && e.key.toLowerCase() === "y",
        run: (t) => t.redo(),
        unlisted: isMac
      }
    ]
  },
  { action: "Submit / next question", combos: [SUBMIT], practiceOnly: true },
  { action: "Enlarged photo back", combos: [CLOSE] },
  { action: "These shortcuts", combos: [TOGGLE_LIST] }
]

/** The card's rows: in practice, or in a game. */
export function listedShortcuts(practice: boolean): Shortcut[] {
  return SHORTCUTS.filter((s) => practice || !s.practiceOnly).map((s) => ({
    ...s,
    combos: s.combos.filter((c) => !c.unlisted)
  }))
}

/** Run the paint key `e` presses, if painting is on; whether it was one. */
export function runPaintKey(e: KeyPress, target: PaintKeyTarget): boolean {
  if (!target.enabled()) return false
  for (const s of SHORTCUTS)
    for (const c of s.combos)
      if (c.run && c.matches(e)) {
        c.run(target)
        return true
      }
  return false
}

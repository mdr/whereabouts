/** What a drag on the map, or a hand in the headset, does. */
export enum Tool {
  PAN = "PAN",
  PAINT = "PAINT",
  ERASE = "ERASE",
  FILL = "FILL"
}

/** The tools that lay paint down or take it off, stroke by stroke. */
export type StrokeTool = Tool.PAINT | Tool.ERASE

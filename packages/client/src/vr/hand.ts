export enum Hand {
  LEFT = "LEFT",
  RIGHT = "RIGHT"
}

export const HANDS = [Hand.LEFT, Hand.RIGHT] as const

/** WebXR's name for each hand, which keys IWSDK's spaces and gamepads. */
export const XR_HAND = { [Hand.LEFT]: "left", [Hand.RIGHT]: "right" } as const

/** The headset's picture card, kept apart from the VR code so the page can say what it shows without loading it. */
import type { FlagCode } from "@whereabouts/shared"

/** What a photo's postcard back says at the reveal. */
export interface Postcard {
  place: string
  text?: string
}

export type VrPicture = { photo: string; postcard?: Postcard } | { flag: FlagCode }

/** A photo, with at the reveal a postcard back telling of the answer, or else a flag. */
export function vrPicture(
  photo: string | undefined,
  flag: FlagCode | undefined,
  postcard: Postcard | undefined
): VrPicture | undefined {
  if (photo) return { photo, ...(postcard ? { postcard } : {}) }
  return flag ? { flag } : undefined
}

/** The headset's picture card, kept apart from the VR code so the page can say what it shows without loading it. */
import type { FlagCode } from "@whereabouts/shared/ids"

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

/**
 * Sharp held a hand's width from the eyes, about 25 pixels a degree; a
 * width Commons serves (it rounds others up).
 */
export const VR_PHOTO_PX = 1920

const photoUrls = new Map<string, Promise<string | undefined>>()

/**
 * The headset's rendition of a Commons photo. WebGL takes only pictures the
 * browser may read back, and the page's photo links go through redirects
 * that don't allow it, so it comes by Commons' API.
 */
export function vrPhotoUrl(file: string): Promise<string | undefined> {
  let url = photoUrls.get(file)
  if (!url) {
    url = lookUp(file)
    url.catch(() => photoUrls.delete(file))
    photoUrls.set(file, url)
  }
  return url
}

async function lookUp(file: string): Promise<string | undefined> {
  const api = new URL("https://commons.wikimedia.org/w/api.php")
  api.search = new URLSearchParams({
    action: "query",
    titles: `File:${file}`,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: String(VR_PHOTO_PX),
    format: "json",
    origin: "*"
  }).toString()
  const res = (await (await fetch(api)).json()) as {
    query?: { pages?: Record<string, { imageinfo?: { thumburl?: string }[] }> }
  }
  return Object.values(res.query?.pages ?? {})[0]?.imageinfo?.[0]?.thumburl
}

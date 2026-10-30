/**
 * Loads a question's pictures before its round starts, so the photo or flag
 * (and the reveal's photo) is already in the page's image cache when it is shown.
 */
import { commonsImageUrl } from "@whereabouts/shared/questions"
import { MAX_ROUNDS, type QuestionPictures } from "@whereabouts/shared/protocol"
import { flagUrl } from "./flags"
import { vrPhotoUrl } from "./vr-picture"
import { loadedVr } from "./vr-support"

/**
 * The browser keeps a picture in memory only while something holds it, so
 * these are held: the page's for a whole game, as its results show them all;
 * the headset's, larger, for this round and the next.
 */
const held = { page: new Map<string, HTMLImageElement>(), headset: new Map<string, HTMLImageElement>() }
const KEEP = { page: 2 * MAX_ROUNDS, headset: 6 }

/** The headset's are loaded as it loads them: to the browser, one loaded otherwise is a different picture. */
function load(url: string, viewer: keyof typeof held): void {
  const pictures = held[viewer]
  let img = pictures.get(url)
  if (img) pictures.delete(url)
  else {
    img = new Image()
    if (viewer === "headset") img.crossOrigin = "anonymous"
    else img.referrerPolicy = "no-referrer"
    img.src = url
  }
  pictures.set(url, img)
  if (pictures.size > KEEP[viewer]) pictures.delete(pictures.keys().next().value!)
}

export function preloadPictures({ image, flag, revealPhoto }: QuestionPictures): void {
  if (image) load(commonsImageUrl(image), "page")
  if (revealPhoto) load(commonsImageUrl(revealPhoto), "page")
  const vr = loadedVr.value?.active.value ?? false
  if (flag)
    void flagUrl(flag).then((url) => {
      if (!url) return
      load(url, "page")
      if (vr) load(url, "headset")
    })
  if (!vr) return
  for (const photo of [image, revealPhoto]) {
    if (photo)
      vrPhotoUrl(photo).then(
        (url) => url && load(url, "headset"),
        () => undefined
      )
  }
}

/** What is held, oldest first, for the tests. */
export function heldPictures(): { page: string[]; headset: string[] } {
  return { page: [...held.page.keys()], headset: [...held.headset.keys()] }
}

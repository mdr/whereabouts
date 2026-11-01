/**
 * Loads a question's picture before its round starts, so it is already in
 * the page's image cache when shown.
 */
import { commonsImageUrl } from "@whereabouts/shared/questions"
import { MAX_ROUNDS } from "@whereabouts/shared/protocol/config"
import { PictureType, type Picture } from "@whereabouts/shared/protocol/views"
import { flagUrl } from "../flags/flags"
import { vrPhotoUrl } from "../vr/picture/vr-picture"
import { loadedVr } from "../vr/vr-support"

/**
 * The browser keeps a picture in memory only while something holds it, so
 * these are held: the page's for a whole game, as its results show them all;
 * the headset's, larger, for this round and the next.
 */
const held = { page: new Map<string, HTMLImageElement>(), headset: new Map<string, HTMLImageElement>() }
const KEEP = { page: 2 * MAX_ROUNDS, headset: 6 }

/** The headset's are loaded as it loads them: to the browser, one loaded otherwise is a different picture. */
const load = (url: string, viewer: keyof typeof held): void => {
  const pictures = held[viewer]
  let image = pictures.get(url)
  if (image) pictures.delete(url)
  else {
    image = new Image()
    if (viewer === "headset") image.crossOrigin = "anonymous"
    else image.referrerPolicy = "no-referrer"
    image.src = url
  }
  pictures.set(url, image)
  if (pictures.size > KEEP[viewer]) pictures.delete(pictures.keys().next().value!)
}

export const preloadPicture = (picture: Picture): void => {
  const vr = loadedVr.value?.active.value ?? false
  switch (picture.type) {
    case PictureType.PHOTO:
      load(commonsImageUrl(picture.photo), "page")
      if (vr)
        vrPhotoUrl(picture.photo).then(
          (url) => url && load(url, "headset"),
          () => undefined
        )
      return
    case PictureType.FLAG:
      void flagUrl(picture.flag).then((url) => {
        if (!url) return
        load(url, "page")
        if (vr) load(url, "headset")
      })
      return
  }
}

/** What is held, oldest first, for the tests. */
export const heldPictures = (): { page: string[]; headset: string[] } => {
  return { page: [...held.page.keys()], headset: [...held.headset.keys()] }
}

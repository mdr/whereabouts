/**
 * Loads a question's pictures before its round starts, so the photo or flag
 * (and the reveal's photo) is already in the page's image cache when it is shown.
 */
import { commonsImageUrl, type QuestionPictures } from "@whereabouts/shared"
import { flagUrl } from "./flags"

/** Held so a load runs to the end, and is not started twice. */
const loading = new Map<string, HTMLImageElement>()

function load(url: string): void {
  if (loading.has(url)) return
  const img = new Image()
  img.referrerPolicy = "no-referrer"
  img.src = url
  loading.set(url, img)
}

export function preloadPictures({ image, flag, revealPhoto }: QuestionPictures): void {
  if (image) load(commonsImageUrl(image))
  if (revealPhoto) load(commonsImageUrl(revealPhoto))
  if (flag) void flagUrl(flag).then((url) => url && load(url))
}

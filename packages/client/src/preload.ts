/**
 * Loads a question's pictures before its round starts, so the photo or flag
 * is already in the page's image cache when it is shown.
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

export function preloadPictures({ image, flag }: QuestionPictures): void {
  if (image) load(commonsImageUrl(image))
  if (flag) void flagUrl(flag).then((url) => url && load(url))
}

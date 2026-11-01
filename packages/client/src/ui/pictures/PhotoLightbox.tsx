import type { ComponentChildren } from "preact"
import { useEffect, useState } from "preact/hooks"
import { commonsImageUrl } from "@whereabouts/shared/questions"
import type { CommonsFile } from "@whereabouts/shared/ids"
import { Lightbox, LightboxType } from "./Lightbox/Lightbox"

/**
 * A photo enlarged: at once the thumbnail's rendition, which the page has,
 * at the size the larger one will show, then that larger one once loaded.
 */
export const PhotoLightbox = ({
  image,
  thumb,
  credit,
  onClose
}: {
  image: CommonsFile
  thumb: HTMLImageElement | undefined
  credit: ComponentChildren
  onClose: () => void
}) => {
  const [src, setSrc] = useState(commonsImageUrl(image))
  useEffect(() => {
    const large = new Image()
    large.referrerPolicy = "no-referrer"
    large.src = commonsImageUrl(image, 1600)
    let open = true
    // Decoded first, so the swap never shows it half drawn.
    large.decode().then(
      () => open && setSrc(large.src),
      () => undefined
    )
    return () => {
      open = false
    }
  }, [image])
  const ratio = thumb?.naturalWidth ? thumb.naturalWidth / thumb.naturalHeight : undefined
  return <Lightbox src={src} type={LightboxType.PHOTO} ratio={ratio} credit={credit} onClose={onClose} />
}

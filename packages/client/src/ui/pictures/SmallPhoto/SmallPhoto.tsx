import { useState } from "preact/hooks"
import { commonsImageUrl } from "@whereabouts/shared/questions"
import type { CommonsFile } from "@whereabouts/shared/ids"
import { useElementRef } from "../../element-ref"
import { CommonsCredit } from "../CommonsCredit/CommonsCredit"
import { useEscape } from "../Lightbox/Lightbox"
import { PhotoLightbox } from "../PhotoLightbox"
import s from "../SmallPicture.module.css"

export function SmallPhoto({ image }: { image: CommonsFile }) {
  const [large, setLarge] = useState(false)
  useEscape(large, () => setLarge(false))
  const thumb = useElementRef<HTMLImageElement>()
  return (
    <>
      <button type="button" class={s.smallPicture} title="Enlarge the photo" onClick={() => setLarge(true)}>
        {/* The rounds' rendition, which the page already has. */}
        <img ref={thumb} src={commonsImageUrl(image)} alt="" referrerpolicy="no-referrer" />
        <span class="sr-only">Enlarge photo</span>
      </button>
      {large && (
        <PhotoLightbox
          image={image}
          thumb={thumb.current ?? undefined}
          credit={<CommonsCredit image={image} />}
          onClose={() => setLarge(false)}
        />
      )}
    </>
  )
}

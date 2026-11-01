import { useState } from "preact/hooks"
import { commonsImageUrl } from "@whereabouts/shared/questions"
import type { CommonsFile } from "@whereabouts/shared/ids"
import { cx } from "../../../cx"
import { useElementRef } from "../../../element-ref"
import { CommonsCredit } from "../../../pictures/CommonsCredit/CommonsCredit"
import { useEscape } from "../../../pictures/Lightbox/Lightbox"
import { PhotoLightbox } from "../../../pictures/PhotoLightbox"
import { EnlargeBadge } from "../EnlargeBadge/EnlargeBadge"
import { questionImageTestIds } from "./QuestionImageTestIds"
import styles from "./QuestionImage.module.css"

/** Whether a photo has shown its "Enlarge" label yet this session: after the first, just the icon. */
let enlargeLabelShown = false

/**
 * The question photo. Click it to enlarge over the map; click again or press
 * Escape to shrink back. The Wikimedia Commons credit sits behind a small
 * info icon linking to the file page.
 */
export const QuestionImage = ({
  image,
  credit: showCredit,
  painting
}: {
  image: CommonsFile
  credit: boolean
  painting: boolean
}) => {
  const [large, setLarge] = useState(false)
  const [withLabel] = useState(() => {
    const first = !enlargeLabelShown
    enlargeLabelShown = true
    return first
  })
  useEscape(large, () => setLarge(false))
  const credit = showCredit ? <CommonsCredit image={image} /> : undefined
  const thumb = useElementRef<HTMLImageElement>()
  return (
    <>
      <div class={cx(styles.thumb, painting && styles.painting)} data-picture data-testid={questionImageTestIds.photo}>
        {/* The whole photo is the button; the badge says so, on phones too, where there is no hover. */}
        <button type="button" class={styles.thumbButton} title="Enlarge the photo" onClick={() => setLarge(true)}>
          <img ref={thumb} src={commonsImageUrl(image)} alt="" referrerpolicy="no-referrer" />
          <EnlargeBadge label={withLabel} />
          <span class="sr-only">Enlarge photo</span>
        </button>
        {credit}
      </div>
      {large && (
        <PhotoLightbox
          image={image}
          thumb={thumb.current ?? undefined}
          credit={credit}
          onClose={() => setLarge(false)}
        />
      )}
    </>
  )
}

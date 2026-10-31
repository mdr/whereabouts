import type { ComponentChildren } from "preact"
import { useEffect, useState } from "preact/hooks"
import { commonsImageUrl, commonsPageUrl } from "@whereabouts/shared/questions"
import { Icon } from "./icons"
import { flagFile, flagRatio, flagUrl } from "../flags"
import { cx } from "./cx"
import { useElementRef } from "./element-ref"
import { Lightbox, PhotoLightbox, useEscape } from "./Lightbox"
import s from "./Pictures.module.css"

/** The picture of a flag, once its chunk has loaded. */
export function useFlagUrl(code: string): string | undefined {
  const [src, setSrc] = useState<string | undefined>(undefined)
  useEffect(() => {
    let live = true
    setSrc(undefined)
    void flagUrl(code).then((url) => live && setSrc(url))
    return () => {
      live = false
    }
  }, [code])
  return src
}

/** The flag's shape, for its frame to take before the picture loads. */
export function flagShape(code: string): Record<string, string> {
  return { "--flag-ratio": String(flagRatio(code)) }
}

/** A small flag beside a country's name, which says the name: no alt text of its own. */
export function SmallFlag({ code, class: cls }: { code: string; class?: string }) {
  const src = useFlagUrl(code)
  return (
    <span class={cx(s.smallFlag, cls)} style={flagShape(code)}>
      {src && <img src={src} alt="" draggable={false} />}
    </span>
  )
}

export function CommonsCredit({ image }: { image: string }) {
  return (
    <a
      class={s.credit}
      href={commonsPageUrl(image)}
      target="_blank"
      rel="noopener"
      title="Image from Wikimedia Commons"
      aria-label="Image credit: Wikimedia Commons"
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="info" size={14} />
    </a>
  )
}

/** A photo the size of a list row; click it to enlarge. */
export function SmallPictureBox({
  class: cls,
  style,
  children
}: {
  class?: string
  style?: Record<string, string>
  children?: ComponentChildren
}) {
  return (
    <span class={cx(s.smallPicture, cls)} style={style}>
      {children}
    </span>
  )
}

export function SmallPhoto({ image }: { image: string }) {
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

/**
 * A flag the size of a list row; click it to enlarge. Shown once the round
 * is over, so its Commons credit (which names the country) can show too.
 */
export function SmallFlagButton({ code }: { code: string }) {
  const src = useFlagUrl(code)
  const file = flagFile(code)
  const [large, setLarge] = useState(false)
  useEscape(large, () => setLarge(false))
  return (
    <>
      <button
        type="button"
        class={cx(s.smallPicture, s.flagPicture)}
        title="Enlarge the flag"
        disabled={!src}
        onClick={() => setLarge(true)}
      >
        <span class={s.flagShape} style={flagShape(code)}>
          {src && <img src={src} alt="" draggable={false} />}
        </span>
        <span class="sr-only">Enlarge flag</span>
      </button>
      {large && src && (
        <Lightbox
          src={src}
          kind="flag"
          ratio={flagRatio(code)}
          credit={file && <CommonsCredit image={file} />}
          onClose={() => setLarge(false)}
        />
      )}
    </>
  )
}

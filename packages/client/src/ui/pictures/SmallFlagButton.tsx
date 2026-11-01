import { useState } from "preact/hooks"
import { flagFile, flagRatio } from "../../flags/flags"
import { cx } from "../cx"
import { CommonsCredit } from "./CommonsCredit"
import { flagShape, useFlagUrl } from "./flag-url"
import { Lightbox, LightboxType, useEscape } from "./Lightbox"
import picture from "./SmallPicture.module.css"
import s from "./SmallFlagButton.module.css"

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
        class={cx(picture.smallPicture, s.flagPicture)}
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
          type={LightboxType.FLAG}
          ratio={flagRatio(code)}
          credit={file && <CommonsCredit image={file} />}
          onClose={() => setLarge(false)}
        />
      )}
    </>
  )
}

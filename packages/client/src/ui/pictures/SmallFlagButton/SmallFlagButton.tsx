import type { FlagCode } from "@whereabouts/shared/ids"
import { useState } from "preact/hooks"
import { flagFile, flagRatio } from "../../../flags/flags"
import { cx } from "../../cx"
import { CommonsCredit } from "../CommonsCredit/CommonsCredit"
import { flagShape, useFlagUrl } from "../flag-url"
import { Lightbox, LightboxType } from "../Lightbox/Lightbox"
import { smallFlagButtonTestIds } from "./SmallFlagButtonTestIds"
import picture from "../SmallPicture.module.css"
import styles from "./SmallFlagButton.module.css"

/**
 * A flag the size of a list row; click it to enlarge. Shown once the round
 * is over, so its Commons credit (which names the country) can show too.
 */
export const SmallFlagButton = ({ code }: { code: FlagCode }) => {
  const src = useFlagUrl(code)
  const file = flagFile(code)
  const [large, setLarge] = useState(false)
  return (
    <>
      <button
        type="button"
        class={cx(picture.smallPicture, styles.flagPicture)}
        title="Enlarge the flag"
        disabled={!src}
        onClick={() => setLarge(true)}
      >
        <span class={styles.flagShape} style={flagShape(code)} data-testid={smallFlagButtonTestIds.flag}>
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

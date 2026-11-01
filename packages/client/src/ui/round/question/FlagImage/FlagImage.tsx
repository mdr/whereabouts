import type { FlagCode } from "@whereabouts/shared/ids"
import { useState } from "preact/hooks"
import { flagRatio } from "../../../../flags/flags"
import { cx } from "../../../cx"
import { flagShape, useFlagUrl } from "../../../pictures/flag-url"
import { Lightbox, LightboxType, useEscape } from "../../../pictures/Lightbox/Lightbox"
import { EnlargeBadge } from "../EnlargeBadge/EnlargeBadge"
import { flagImageTestIds } from "./FlagImageTestIds"
import s from "./FlagImage.module.css"

/** A flag round's flag; click it to enlarge. No alt text naming it: that would give the answer away. */
export function FlagImage({ code, painting }: { code: FlagCode; painting: boolean }) {
  const src = useFlagUrl(code)
  const [large, setLarge] = useState(false)
  useEscape(large, () => setLarge(false))
  return (
    <>
      <button
        type="button"
        class={cx(s.flag, painting && s.painting)}
        data-picture
        title="Enlarge the flag"
        disabled={!src}
        onClick={() => setLarge(true)}
        style={flagShape(code)}
        data-testid={flagImageTestIds.flag}
      >
        {src && <img src={src} alt="The flag" draggable={false} />}
        <EnlargeBadge />
        <span class="sr-only">Enlarge flag</span>
      </button>
      {large && src && (
        <Lightbox
          src={src}
          type={LightboxType.FLAG}
          ratio={flagRatio(code)}
          credit={undefined}
          onClose={() => setLarge(false)}
        />
      )}
    </>
  )
}

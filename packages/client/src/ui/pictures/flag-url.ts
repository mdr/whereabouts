import { useEffect, useState } from "preact/hooks"
import type { FlagCode } from "@whereabouts/shared/ids"
import { flagRatio, flagUrl } from "../../flags/flags"

/** The picture of a flag, once its chunk has loaded. */
export function useFlagUrl(code: FlagCode): string | undefined {
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
export function flagShape(code: FlagCode): Record<string, string> {
  return { "--flag-ratio": String(flagRatio(code)) }
}

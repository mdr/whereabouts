/**
 * Flag pictures from Wikimedia Commons, at each flag's own proportions (see
 * scripts/build-flags.mjs). Each is its own small chunk, fetched when its
 * round comes up, so the 194 flags cost nothing until they are shown.
 */
import flags from "./assets/flags/flags.json"

const FLAGS = import.meta.glob<string>("./assets/flags/*.svg", { query: "?url", import: "default" })

const info: Record<string, { ratio: number; file: string; licence: string } | undefined> = flags

const urls = new Map<string, Promise<string | undefined>>()

/** The picture of the flag with this ISO code, or undefined when there is none. */
export function flagUrl(code: string): Promise<string | undefined> {
  let url = urls.get(code)
  if (!url) {
    const load = FLAGS[`./assets/flags/${code}.svg`]
    url = load ? load().catch(() => undefined) : Promise.resolve(undefined)
    urls.set(code, url)
  }
  return url
}

/** The flag's width over its height, known before its picture loads. */
export function flagRatio(code: string): number {
  return info[code]?.ratio ?? 3 / 2
}

/** The flag's file on Wikimedia Commons, for crediting it. */
export function flagFile(code: string): string | undefined {
  return info[code]?.file
}

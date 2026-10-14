/**
 * Flag pictures, from the flag-icons package (MIT): one 4:3 SVG per ISO
 * code. Each is its own small chunk, fetched when its round comes up, so the
 * ~270 flags cost nothing until they are shown.
 */
const FLAGS = import.meta.glob<string>("/node_modules/flag-icons/flags/4x3/*.svg", {
  query: "?url",
  import: "default"
})

const urls = new Map<string, Promise<string | undefined>>()

/** The picture of the flag with this ISO code, or undefined when there is none. */
export function flagUrl(code: string): Promise<string | undefined> {
  let url = urls.get(code)
  if (!url) {
    const load = FLAGS[`/node_modules/flag-icons/flags/4x3/${code}.svg`]
    url = load ? load().catch(() => undefined) : Promise.resolve(undefined)
    urls.set(code, url)
  }
  return url
}

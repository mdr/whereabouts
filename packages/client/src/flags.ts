/**
 * Flag pictures, from the flag-icons package (MIT): one 4:3 SVG per ISO
 * code. Each is its own small chunk, fetched when its round comes up, so the
 * ~270 flags cost nothing until they are shown.
 */
const FLAGS = import.meta.glob<string>("/node_modules/flag-icons/flags/4x3/*.svg", {
  query: "?url",
  import: "default",
});

const urls = new Map<string, Promise<string | null>>();

/** The picture of the flag with this ISO code, or null when there is none. */
export function flagUrl(code: string): Promise<string | null> {
  let url = urls.get(code);
  if (!url) {
    const load = FLAGS[`/node_modules/flag-icons/flags/4x3/${code}.svg`];
    url = load ? load().catch(() => null) : Promise.resolve(null);
    urls.set(code, url);
  }
  return url;
}

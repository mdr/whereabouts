const graphemes = new Intl.Segmenter()

/** A name's first character as a reader sees it, so a flag or family emoji stays whole. */
export const initial = (name: string): string => {
  const first = graphemes.segment(name.trim())[Symbol.iterator]().next()
  return first.done ? "?" : first.value.segment.toUpperCase()
}

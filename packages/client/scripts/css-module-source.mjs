// Reads a CSS module's source text for what lightningcss's output doesn't locate.

const COMMENTS = /\/\*[\s\S]*?\*\//g
const COMMENTS_STRINGS_URLS = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\)/g

/** The source with comments (and optionally strings and urls) blanked, keeping every offset and line. */
const blank = (css, pattern) => {
  return css.replace(pattern, (m) => m.replace(/[^\n]/g, " "))
}

const positionAt = (css, offset) => {
  const before = css.slice(0, offset)
  return { line: before.split("\n").length - 1, column: offset - (before.lastIndexOf("\n") + 1) }
}

/** Zero-based line and column of each class's first `.name` outside comments and strings. */
export const classPositions = (css) => {
  const positions = new Map()
  for (const match of blank(css, COMMENTS_STRINGS_URLS).matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    if (!positions.has(match[1])) positions.set(match[1], positionAt(css, match.index + 1))
  }
  return positions
}

/** Each `composes:` declaration: its names, the specifier after `from` (if any), and zero-based line. */
export const composesDeclarations = (css) => {
  return [...blank(css, COMMENTS).matchAll(/composes\s*:\s*([^;}]*)/g)].map((match) => {
    const from = /^([\s\S]*?)\s+from\s+(?:"([^"]*)"|'([^']*)'|(global))\s*$/.exec(match[1])
    return {
      names: (from ? from[1] : match[1]).split(/\s+/).filter(Boolean),
      from: from ? (from[2] ?? from[3] ?? from[4]) : undefined,
      line: positionAt(css, match.index).line
    }
  })
}

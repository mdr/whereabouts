// Reads a CSS module's source text for what lightningcss's output doesn't locate.

const COMMENTS = /\/\*[\s\S]*?\*\//g
const COMMENTS_STRINGS_URLS = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\)/g

export interface Position {
  line: number
  column: number
}

export interface ComposesDeclaration {
  names: string[]
  from: string | undefined
  line: number
}

/** The source with comments (and optionally strings and urls) blanked, keeping every offset and line. */
const blank = (css: string, pattern: RegExp): string => css.replace(pattern, (match) => match.replace(/[^\n]/g, " "))

const positionAt = (css: string, offset: number): Position => {
  const before = css.slice(0, offset)
  return { line: before.split("\n").length - 1, column: offset - (before.lastIndexOf("\n") + 1) }
}

/** Zero-based line and column of each class's first `.name` outside comments and strings. */
export const classPositions = (css: string): Map<string, Position> => {
  const positions = new Map<string, Position>()
  for (const match of blank(css, COMMENTS_STRINGS_URLS).matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
    const [, name = ""] = match
    if (!positions.has(name)) positions.set(name, positionAt(css, match.index + 1))
  }
  return positions
}

/** Each `composes:` declaration: its names, the specifier after `from` (if any), and zero-based line. */
export const composesDeclarations = (css: string): ComposesDeclaration[] =>
  [...blank(css, COMMENTS).matchAll(/composes\s*:\s*([^;}]*)/g)].map((match) => {
    const from = /^([\s\S]*?)\s+from\s+(?:"([^"]*)"|'([^']*)'|(global))\s*$/.exec(match[1]!)
    return {
      names: (from ? from[1]! : match[1]!).split(/\s+/).filter(Boolean),
      from: from ? (from[2] ?? from[3] ?? from[4]) : undefined,
      line: positionAt(css, match.index).line
    }
  })

// Checks that every class a CSS module composes exists, which lightningcss does not.
import type { CSSModuleExports, DependencyCSSModuleReference, LocalCSSModuleReference } from "lightningcss"
import { composesDeclarations } from "./css-module-source.ts"

const distance = (a: string, b: string): number => {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    row = next
  }
  return row[b.length]!
}

const didYouMean = (name: string, candidates: Iterable<string>): string => {
  const [best] = [...candidates].map((c): [string, number] => [c, distance(name, c)]).sort((a, b) => a[1] - b[1])
  return best && best[1] <= Math.max(2, name.length / 3) ? ` Did you mean "${best[0]}"?` : ""
}

interface CssModule {
  file: string
  css: string
  exports: CSSModuleExports
  lookup: (specifier: string) => string[] | undefined
}

/**
 * Error messages for the composes in a module that name a missing class or file.
 * `exports` is lightningcss's result for the module; `lookup(specifier)` gives
 * the class names another module exports, or undefined if it doesn't exist.
 */
export const composesErrors = ({ file, css, exports, lookup }: CssModule): string[] => {
  const declarations = composesDeclarations(css)
  const lineOf = (name: string, from?: string): number =>
    (declarations.find((d) => d.names.includes(name) && d.from === from)?.line ?? 0) + 1
  const own = Object.keys(exports)
  const prefixLength = own.length ? exports[own[0]!]!.name.length - own[0]!.length : 0
  const localError = (ref: LocalCSSModuleReference): string | undefined => {
    if (own.some((key) => exports[key]!.name === ref.name)) return undefined
    const name = ref.name.slice(prefixLength)
    return `${file}:${lineOf(name)}: composes "${name}", which this module does not define.${didYouMean(name, own)}`
  }
  const dependencyError = (ref: DependencyCSSModuleReference): string | undefined => {
    const names = lookup(ref.specifier)
    if (names?.includes(ref.name)) return undefined
    const where = `${file}:${lineOf(ref.name, ref.specifier)}: composes "${ref.name}" from "${ref.specifier}"`
    return names
      ? `${where}, which does not define it.${didYouMean(ref.name, names)}`
      : `${where}, but that file does not exist.`
  }
  return Object.values(exports)
    .flatMap(({ composes }) => composes)
    .map((ref) =>
      ref.type === "local" ? localError(ref) : ref.type === "dependency" ? dependencyError(ref) : undefined
    )
    .filter((error) => error !== undefined)
}

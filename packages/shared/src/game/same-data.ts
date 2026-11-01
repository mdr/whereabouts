/** Plain data (settings, a mix) compared by value. */
export function sameData(a: unknown, b: unknown): boolean {
  if (!(a instanceof Object) || !(b instanceof Object)) return a === b
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].every((k) => sameData(x[k], y[k]))
}

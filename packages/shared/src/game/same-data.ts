/** Plain data (settings, a mix) compared by value. */
export const sameData = (a: unknown, b: unknown): boolean => {
  if (!(a instanceof Object) || !(b instanceof Object)) return a === b
  const first = a as Record<string, unknown>
  const second = b as Record<string, unknown>
  return [...new Set([...Object.keys(first), ...Object.keys(second)])].every((key) => sameData(first[key], second[key]))
}

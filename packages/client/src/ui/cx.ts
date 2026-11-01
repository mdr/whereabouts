/** A class attribute from CSS module names, leaving out those switched off. */
export const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(" ")

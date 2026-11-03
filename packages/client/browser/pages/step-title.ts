const MAX_ARGUMENT_LENGTH = 60

const truncate = (text: string): string =>
  text.length > MAX_ARGUMENT_LENGTH ? `${text.slice(0, MAX_ARGUMENT_LENGTH - 1)}…` : text

const formatArgument = (argument: unknown): string => {
  if (typeof argument === "string") return truncate(JSON.stringify(argument))
  if (typeof argument === "function") return "fn"
  if (typeof argument !== "object" || !argument) return String(argument)
  const { constructor } = argument
  if (typeof constructor === "function" && constructor !== Object && constructor !== Array) return constructor.name
  return truncate(JSON.stringify(argument))
}

/** `Class.method` followed by the call's arguments, each short enough to read in a report. */
export const stepTitle = (className: string, method: string, args: readonly unknown[]): string =>
  args.length === 0 ? `${className}.${method}` : `${className}.${method} ${args.map(formatArgument).join(", ")}`

/** The server answered a step with an error instead of doing it. */
export class Refused extends Error {
  readonly reason: string

  constructor(reason: string) {
    super(`refused: ${reason}`)
    this.reason = reason
  }
}

/** The step is refused with exactly this message. */
export const expectRefused = async (step: () => Promise<unknown>, message: string): Promise<void> => {
  const outcome = await step().then(
    () => undefined,
    (error: unknown) => error
  )
  if (outcome === undefined) throw new Error(`expected to be refused with "${message}", but the step went through`)
  if (!(outcome instanceof Refused)) throw new Error("the step failed", { cause: outcome })
  if (outcome.reason !== message)
    throw new Error(`expected to be refused with "${message}", got "${outcome.reason}"`, { cause: outcome })
}

/** `load`, run on the first call and its result kept; a failure is forgotten, so the next call tries again (after a dropped connection, say). */
export const once = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let loading: Promise<T> | undefined = undefined
  return () =>
    (loading ??= load().catch((error: unknown) => {
      loading = undefined
      throw error
    }))
}

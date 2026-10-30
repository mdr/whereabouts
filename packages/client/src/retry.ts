/** `load`, tried again after each delay if it fails, as on a phone between masts. */
export async function withRetries<T>(load: () => Promise<T>, delaysMs: readonly number[] = [1000, 3000]): Promise<T> {
  for (const delay of delaysMs) {
    try {
      return await load()
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  return load()
}

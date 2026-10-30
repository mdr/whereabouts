import { withRetries } from "./retry"

/**
 * A tab open across a deploy asks for files the new build no longer has.
 * Reloading fetches the current build; a game seat survives a reload. At
 * most once a minute, so a file that is truly missing cannot loop: then the
 * error stands and the screen offers another try.
 */
const KEY = "whereabouts.staleBuildReloadAt"

export function reloadForNewBuild(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 60_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return false
  }
  location.reload()
  return true
}

export function reloadOnStaleBuild(): void {
  window.addEventListener("vite:preloadError", (e) => {
    if (reloadForNewBuild()) e.preventDefault()
  })
}

/**
 * A JSON file from this build, fetched rather than imported: Chrome never
 * fetches a failed module import again, so it could not be retried.
 */
export function fetchBuildJson<T>(url: string): Promise<T> {
  return withRetries(async () => {
    const res = await fetch(url)
    if (res.status === 404) reloadForNewBuild()
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    return (await res.json()) as T
  })
}

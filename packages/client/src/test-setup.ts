import { afterEach } from "vite-plus/test"

// Testing Library unmounts after each test only where test globals are on, and they aren't.
afterEach(async () => {
  if (typeof document === "undefined") return
  const { cleanup } = await import("@testing-library/preact")
  cleanup()
})

if (typeof document !== "undefined") await import("./test-hooks")

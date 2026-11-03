import { test, type TestAPI } from "vite-plus/test"
import { configureGameRooms, realClock } from "../rooms.ts"
import { InProcessServer, type InProcessOptions } from "./in-process-server.ts"
import { TEST_CATALOGUE, TEST_CONFIG } from "./test-questions.ts"

/**
 * `it` for specs that play on an in-process server, started for each test and
 * given as `server`. Fails a test that was sent a state not matching GameViewSchema.
 */
export const useInProcessServer = (options: InProcessOptions = {}): TestAPI<{ server: InProcessServer }> =>
  test.extend<{ server: InProcessServer }>({
    server: async ({ task: _task }, use) => {
      const server = await InProcessServer.start({ config: TEST_CONFIG, catalogue: TEST_CATALOGUE, ...options })
      try {
        await use(server)
        const invalid = server.invalidStates
        if (invalid.length > 0) throw new Error(`state did not match GameViewSchema:\n${invalid.join("\n")}`)
      } finally {
        await server.close()
        configureGameRooms({ clock: realClock })
      }
    }
  })

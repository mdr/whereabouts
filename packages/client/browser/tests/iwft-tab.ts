import type { Browser } from "@playwright/test"
import { routeGameSocket } from "../game-server/route-socket.ts"
import type { TestGame } from "../game-server/game-server.ts"
import type { Tab } from "../pages/Tab.ts"
import { openTab, type TabOptions } from "./support.ts"

/** A tab that plays on the test's in-process server. */
export const newTab = (
  browser: Browser,
  label: string,
  { game, ...options }: TabOptions & { game: TestGame }
): Promise<Tab> => openTab(browser, label, options, (context) => routeGameSocket(context, game.server.socketUrl))

/** A tab that never joins a game (practice, score review, load failures): a game socket is refused. */
export const newOfflineTab = (browser: Browser, label: string, options: TabOptions = {}): Promise<Tab> =>
  openTab(browser, label, options, async (context) => {
    await context.routeWebSocket(/\/ws$/, (route) => void route.close())
    return undefined
  })

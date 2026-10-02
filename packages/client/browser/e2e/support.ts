import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContextOptions } from "playwright-core";
import { App } from "../pages/App.ts";

/** The Vite dev server, which proxies the game server. */
export const DEV_URL = "http://localhost:5173";

/** The local Chrome, headless, with WebGL in software so the map draws without a GPU. */
export function launchChrome(extraArgs: string[] = []): Promise<Browser> {
  return chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", ...extraArgs],
  });
}

/** The screenshot folder from the command line, made if missing. */
export function outDir(): string {
  const dir = process.argv[2] ?? "./smoke-out";
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface PlayerOptions {
  context?: BrowserContextOptions;
  dev?: boolean;
  baseUrl?: string;
  /** Runs in the page before any of the app's scripts. */
  initScript?: () => void;
}

/** A new browser context and tab, with its page errors logged under `label`. */
export async function openApp(browser: Browser, label: string, options: PlayerOptions = {}): Promise<App> {
  const context = await browser.newContext(options.context ?? { viewport: { width: 1300, height: 900 } });
  if (options.initScript) await context.addInitScript(options.initScript);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[${label} pageerror]`, e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${label} console.error]`, m.text().slice(0, 200));
  });
  return new App(page, options.baseUrl ?? DEV_URL, { dev: options.dev ?? false });
}

/** Collects pass/fail results, printing each as it comes. */
export class Checks {
  #failures: string[] = [];

  check(ok: boolean, what: string): void {
    console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) this.#failures.push(what);
  }

  /** Prints the summary and exits non-zero if anything failed. */
  finish(): never {
    if (this.#failures.length > 0) {
      console.log(`\n${this.#failures.length} failure(s)`);
      process.exit(1);
    }
    console.log("\nall ok");
    process.exit(0);
  }
}

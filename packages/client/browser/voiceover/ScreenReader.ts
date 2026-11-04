import { appendFileSync } from "node:fs"
import { macOSActivateId, type VoiceOver } from "@guidepup/guidepup"
import { test } from "@playwright/test"
import type { Ms } from "@whereabouts/shared/units"
import type { Tab } from "../pages/Tab.ts"
import { moveIntoWebContent } from "./into-web-content.ts"
import { lastPhrase } from "./last-phrase.ts"

const CHROME_ID = "com.google.Chrome"
/** More than any screen of ours has items: a backstop should the end never be spoken. */
const MOST_ITEMS = 300
const POLL: Ms = 200

/** The real VoiceOver, on a tab: what it says as a spec moves it or the app changes. */
export class ScreenReader {
  /** Guidepup's VoiceOver, for anything the helpers here don't cover. */
  readonly voiceOver: VoiceOver
  readonly #tab: Tab

  constructor(voiceOver: VoiceOver, tab: Tab) {
    this.voiceOver = voiceOver
    this.#tab = tab
  }

  /** Puts VoiceOver in the page again, as after loading a route with tab.open. */
  async enterPage(): Promise<void> {
    await this.#toFront()
    await moveIntoWebContent(this.voiceOver)
  }

  /**
   * What VoiceOver says from the start of `action`, something done to the app (a page-object
   * click, a server event), until `listenFor` after it ends: an empty list if nothing. Not for
   * VoiceOver's own commands, which `command` reports.
   */
  async heard(action: () => unknown, listenFor: Ms = 3_000): Promise<string[]> {
    // VoiceOver voices a live region only in the frontmost app.
    await this.#toFront()
    // Guidepup records speech only around its own commands, and its capture stops once
    // speech settles: too soon for news that follows a change. So this asks VoiceOver itself.
    let last = await lastPhrase()
    const phrases: string[] = []
    let until = Number.POSITIVE_INFINITY
    const listening = (async (): Promise<void> => {
      while (Date.now() < until) {
        const phrase = await lastPhrase().catch(() => last)
        if (phrase !== last) {
          last = phrase
          // VoiceOver's idle hint on using the current item is not news.
          const said = phrase.replace(/\s*You are currently on .*$/s, "").trim()
          if (said) phrases.push(said)
        }
        await new Promise((resolve) => setTimeout(resolve, POLL))
      }
    })()
    try {
      await action()
    } finally {
      until = Date.now() + listenFor
      await listening
    }
    return phrases
  }

  /** What VoiceOver said for its own commands in `run`, e.g. `voiceOver.press("Tab")`. */
  async command(run: (voiceOver: VoiceOver) => Promise<unknown>): Promise<string[]> {
    await this.voiceOver.clearSpokenPhraseLog()
    await run(this.voiceOver)
    return (await this.voiceOver.spokenPhraseLog()).filter((phrase) => phrase !== "")
  }

  /** Every item from VoiceOver's place to the end of the page, as VO-Right reads them. */
  async readAll(): Promise<string[]> {
    const items: string[] = []
    for (let i = 0; i < MOST_ITEMS; i++) {
      await this.voiceOver.next()
      const phrase = await this.voiceOver.lastSpokenPhrase()
      // At the end VoiceOver says nothing, or the last item again.
      if (phrase === "" || phrase === items.at(-1)) break
      items.push(phrase)
    }
    return items
  }

  async #toFront(): Promise<void> {
    await macOSActivateId(CHROME_ID)
    await this.#tab.page.bringToFront()
  }

  /** Prints phrases under a heading, and adds them to heard.txt in the test's output folder. */
  report(title: string, phrases: string[]): void {
    const text = `\n${title}\n${phrases.map((phrase) => `  ${phrase}`).join("\n")}\n`
    process.stdout.write(text)
    appendFileSync(test.info().outputPath("heard.txt"), text)
  }
}

import { appendFileSync } from "node:fs"
import { macOSActivateId, type VoiceOver } from "@guidepup/guidepup"
import { test } from "@playwright/test"
import type { Tab } from "../pages/Tab.ts"
import { moveIntoWebContent } from "./into-web-content.ts"

const CHROME_ID = "com.google.Chrome"
/** More than any screen of ours has items: a backstop should the end never be spoken. */
const MOST_ITEMS = 300

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
    await macOSActivateId(CHROME_ID)
    await this.#tab.page.bringToFront()
    await moveIntoWebContent(this.voiceOver)
  }

  /**
   * What VoiceOver said after `action`, something done to the app (a Playwright click, a
   * server event): an empty list if it said nothing new. Not for VoiceOver's own commands,
   * which `command` reports.
   */
  async heard(action: () => unknown): Promise<string[]> {
    const before = await this.voiceOver.lastSpokenPhrase()
    const { spokenPhrase } = await this.voiceOver.capture(
      async () => {
        await action()
      },
      { capture: true }
    )
    // With nothing new to hear, capture gives back the last thing VoiceOver said, or its idle
    // hint on using the current item.
    const said = spokenPhrase.replace(/\s*You are currently on .*$/s, "").trim()
    return said === "" || spokenPhrase === before ? [] : [said]
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

  /** Prints phrases under a heading, and adds them to heard.txt in the test's output folder. */
  report(title: string, phrases: string[]): void {
    const text = `\n${title}\n${phrases.map((phrase) => `  ${phrase}`).join("\n")}\n`
    process.stdout.write(text)
    appendFileSync(test.info().outputPath("heard.txt"), text)
  }
}

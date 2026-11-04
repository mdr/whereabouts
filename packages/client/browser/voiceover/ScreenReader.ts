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

  /** What VoiceOver said while `action` ran: a keypress, a VoiceOver move, a server event. */
  async heard(action: () => unknown): Promise<string[]> {
    await this.voiceOver.clearSpokenPhraseLog()
    await action()
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

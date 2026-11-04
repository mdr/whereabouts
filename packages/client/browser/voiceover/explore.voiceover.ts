// Runs the VoiceOver script in VOICEOVER_SCRIPT against the game, from Home, and prints what
// VoiceOver says at each step (see docs/screen-reader-testing.md).
import { readFileSync, writeFileSync } from "node:fs"
import { macOSActivateId, voiceOver } from "@guidepup/guidepup"
import { test } from "../game-server/game-server.ts"
import { newTab } from "../tests/iwft-tab.ts"
import { parseScript } from "./commands.ts"
import { moveIntoWebContent } from "./into-web-content.ts"
import { runCommand } from "./run-command.ts"

const CHROME_ID = "com.google.Chrome"

test("explore", async ({ browser, game }) => {
  const scriptPath = process.env["VOICEOVER_SCRIPT"]
  if (!scriptPath) throw new Error("Set VOICEOVER_SCRIPT to a script of commands (task voiceover -- <script>)")
  const steps = parseScript(readFileSync(scriptPath, "utf8"))
  const tab = await newTab(browser, "VoiceOver", { game })
  await tab.open("/")

  await voiceOver.start()
  try {
    await macOSActivateId(CHROME_ID)
    await tab.page.bringToFront()
    await moveIntoWebContent(voiceOver)
    const transcript: string[] = []
    for (const step of steps) {
      const phrases = await runCommand({ voiceOver, tab, game }, step.command)
      const entry = [`> ${step.line}`, ...phrases.map((phrase) => `  ${phrase}`)].join("\n")
      process.stdout.write(`${entry}\n`)
      transcript.push(entry)
    }
    writeFileSync(test.info().outputPath("transcript.txt"), `${transcript.join("\n")}\n`)
  } finally {
    await voiceOver.stop()
  }
})

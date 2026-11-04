import type { VoiceOver } from "@guidepup/guidepup"
import type { TestGame } from "../game-server/game-server.ts"
import type { Tab } from "../pages/Tab.ts"
import { CommandType, type Command } from "./commands.ts"
import { moveIntoWebContent } from "./into-web-content.ts"

interface Session {
  voiceOver: VoiceOver
  tab: Tab
  game: TestGame
}

const times = async (count: number, step: () => Promise<void>): Promise<void> => {
  for (let i = 0; i < count; i++) await step()
}

/** Carries out a command and returns what VoiceOver said meanwhile. */
export const runCommand = async ({ voiceOver, tab, game }: Session, command: Command): Promise<string[]> => {
  await voiceOver.clearSpokenPhraseLog()
  switch (command.type) {
    case CommandType.NEXT:
      await times(command.times, () => voiceOver.next())
      break
    case CommandType.PREVIOUS:
      await times(command.times, () => voiceOver.previous())
      break
    case CommandType.NEXT_HEADING:
      await voiceOver.nextHeading()
      break
    case CommandType.NEXT_LANDMARK:
      await voiceOver.nextLandmark()
      break
    case CommandType.ACT:
      await voiceOver.act()
      break
    case CommandType.PRESS:
      for (const key of command.keys) await voiceOver.press(key)
      break
    case CommandType.TYPE:
      await voiceOver.type(command.text)
      break
    case CommandType.OPEN:
      await tab.open(command.route)
      await moveIntoWebContent(voiceOver)
      break
    case CommandType.SEAT:
      game.seat(command.names)
      break
    case CommandType.ITEM:
      return [await voiceOver.itemText()]
  }
  return voiceOver.spokenPhraseLog()
}

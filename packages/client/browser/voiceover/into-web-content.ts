import { MacOSKeyCodes, voiceOverKeyCodeCommands, type VoiceOver } from "@guidepup/guidepup"

const ATTEMPTS = 10

/**
 * Puts the VoiceOver cursor inside the browser's web content, as @guidepup/playwright does:
 * through VoiceOver's item chooser, since the cursor starts on the browser's own controls.
 */
export const moveIntoWebContent = async (voiceOver: VoiceOver): Promise<void> => {
  let chooserOpen = false
  for (let attempt = 0; attempt < ATTEMPTS && !chooserOpen; attempt++) {
    await voiceOver.perform({ keyCode: MacOSKeyCodes.Control }, { capture: false })
    await voiceOver.perform({ keyCode: MacOSKeyCodes.Escape }, { capture: false })
    await voiceOver.perform(voiceOverKeyCodeCommands.openItemChooser, { capture: true })
    chooserOpen = (await voiceOver.lastSpokenPhrase()).toLowerCase().includes("item chooser")
  }
  if (!chooserOpen) throw new Error("VoiceOver's item chooser didn't open")
  await voiceOver.type("web content", { capture: false })
  await voiceOver.perform({ keyCode: MacOSKeyCodes.Enter }, { capture: false })
  await voiceOver.interact({ capture: false })
}

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)
const SCRIPT =
  'tell application "VoiceOver"\nwith transaction\nreturn content of last phrase\nend transaction\nend tell'

/**
 * What VoiceOver said last, asked of VoiceOver itself: Guidepup's lastSpokenPhrase is the
 * last it recorded, which misses anything said between its commands.
 */
export const lastPhrase = async (): Promise<string> => {
  const { stdout } = await run("osascript", ["-e", SCRIPT])
  return stdout.trim()
}

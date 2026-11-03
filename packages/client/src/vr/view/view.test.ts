import { describe, expect, it } from "vite-plus/test"
import type { CommonsFile, FlagCode } from "@whereabouts/shared/ids"
import type { HintBand } from "@whereabouts/shared/hints"
import { VrPictureType } from "../picture/vr-picture"
import { HintAllowance, VrViewType, sceneOf, type VrReveal, type VrRound, type VrView } from "./view"

const makeRound = (over: Partial<VrRound> = {}): VrRound =>
  ({ prompt: "Where is Paris?", picture: undefined, hint: undefined, hintsLeft: 3, ...over }) as VrRound

const paint = (round: VrRound): VrView => ({ type: VrViewType.PAINT, round })
const reveal = (round: VrRound): VrView => ({ type: VrViewType.REVEAL, round, reveal: {} as VrReveal })

describe("sceneOf", () => {
  it("is the same while a round is painted, whatever changes on it", () => {
    const before = makeRound()
    const after = makeRound({
      hint: {} as HintBand,
      hintsLeft: HintAllowance.NONE,
      note: "Done",
      timeLeft: () => 0
    })
    expect(sceneOf(paint(after))).toBe(sceneOf(paint(before)))
  })

  it("changes from a round to its answer", () => {
    expect(sceneOf(reveal(makeRound()))).not.toBe(sceneOf(paint(makeRound())))
  })

  it("changes with the question", () => {
    expect(sceneOf(paint(makeRound({ prompt: "Where is Rome?" })))).not.toBe(sceneOf(paint(makeRound())))
  })

  it("tells pictured questions with the same wording apart", () => {
    const photo = (file: string): VrRound =>
      makeRound({ prompt: "Where is this?", picture: { type: VrPictureType.PHOTO, photo: file as CommonsFile } })
    const flag = (code: string): VrRound =>
      makeRound({ prompt: "Whose flag?", picture: { type: VrPictureType.FLAG, flag: code as FlagCode } })
    expect(sceneOf(paint(photo("a.jpg")))).not.toBe(sceneOf(paint(photo("b.jpg"))))
    expect(sceneOf(paint(flag("fr")))).not.toBe(sceneOf(paint(flag("de"))))
  })

  it("keeps the answer's scene when its picture gains a postcard back", () => {
    const photo = { type: VrPictureType.PHOTO, photo: "a.jpg" as CommonsFile } as const
    const withBack = makeRound({ picture: { ...photo, postcard: {} as never } })
    expect(sceneOf(reveal(withBack))).toBe(sceneOf(reveal(makeRound({ picture: photo }))))
  })

  it("is the kind of view for a menu", () => {
    const lobby = (title: string): VrView => ({
      type: VrViewType.LOBBY,
      summary: { title, scoreLine: "", actions: [] }
    })
    expect(sceneOf(lobby("Joining…"))).toBe(sceneOf(lobby("Game ABCD")))
    expect(sceneOf(lobby("Game ABCD"))).not.toBe(
      sceneOf({ type: VrViewType.DONE, summary: { title: "Game ABCD", scoreLine: "", actions: [] } })
    )
  })
})

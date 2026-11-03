import { describe, expect, it } from "vite-plus/test"
import { makePlayer, makeSpectator } from "../../test-view"
import { PlayerTag, playerTags } from "./player-tags"

const plain = { isYou: false, markWatchers: true, showLocked: false }

describe("playerTags", () => {
  it("tags nothing on an ordinary player", () => {
    expect(playerTags(makePlayer({ isHost: false }), plain)).toEqual([])
  })

  it("tags the host, you and an offline player, in that order", () => {
    expect(playerTags(makePlayer({ isHost: true, connected: false }), { ...plain, isYou: true })).toEqual([
      PlayerTag.HOST,
      PlayerTag.YOU,
      PlayerTag.OFFLINE
    ])
  })

  it("tags a finished player done only where asked", () => {
    const player = makePlayer({ isHost: false, locked: true })
    expect(playerTags(player, plain)).toEqual([])
    expect(playerTags(player, { ...plain, showLocked: true })).toEqual([PlayerTag.DONE])
    expect(playerTags(makePlayer({ isHost: false, locked: false }), { ...plain, showLocked: true })).toEqual([])
  })

  it("tags a watcher only where asked", () => {
    expect(playerTags(makeSpectator(), plain)).toEqual([PlayerTag.WATCHING])
    expect(playerTags(makeSpectator(), { ...plain, markWatchers: false })).toEqual([])
  })

  it("never tags a watcher done", () => {
    expect(playerTags(makeSpectator(), { ...plain, showLocked: true })).toEqual([PlayerTag.WATCHING])
  })
})

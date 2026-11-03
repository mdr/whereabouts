import { describe, expect, it } from "vite-plus/test"
import { roomCode } from "@whereabouts/shared/ids"
import { GameEntryType } from "@whereabouts/shared/protocol/ticket"
import { Role } from "@whereabouts/shared/roles"
import { multiplayerKey } from "./multiplayer-key"

const HOST = { type: GameEntryType.HOST } as const
const JOIN = { type: GameEntryType.JOIN, code: roomCode("AB12"), role: Role.PLAYER } as const

describe("multiplayerKey", () => {
  it("is the same for the same entry and visit", () => {
    expect(multiplayerKey(3, HOST)).toBe(multiplayerKey(3, HOST))
  })

  it("changes on hosting again, though the entry is the same", () => {
    expect(multiplayerKey(4, HOST)).not.toBe(multiplayerKey(3, HOST))
  })

  it("tells hosting, hosting under a code and joining apart", () => {
    const keys = [HOST, { ...HOST, code: roomCode("AB12") }, JOIN, { ...JOIN, code: roomCode("CD34") }].map((entry) =>
      multiplayerKey(1, entry)
    )
    expect(new Set(keys).size).toBe(4)
  })
})

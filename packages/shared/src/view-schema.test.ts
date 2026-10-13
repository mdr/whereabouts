import { describe, expectTypeOf, it } from "vitest"
import type { z } from "zod"
import type { GameView } from "./protocol.ts"
import type { GameViewSchema } from "./view-schema.ts"

describe("GameViewSchema", () => {
  it("describes exactly the GameView type", () => {
    expectTypeOf<z.infer<typeof GameViewSchema>>().toEqualTypeOf<GameView>()
  })
})

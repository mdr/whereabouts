import { describe, expectTypeOf, it } from "vite-plus/test"
import type { z } from "zod"
import type { GameView } from "./views.ts"
import type { GameViewSchema } from "./view-schema.ts"

describe("GameViewSchema", () => {
  it("describes exactly the GameView type", () => {
    // Branded: the plain check tells an enum inside an object from that same enum.
    expectTypeOf<z.infer<typeof GameViewSchema>>().branded.toEqualTypeOf<GameView>()
  })
})

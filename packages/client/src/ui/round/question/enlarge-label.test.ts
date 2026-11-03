import { describe, expect, it } from "vite-plus/test"
import { EnlargeLabel } from "./enlarge-label"

describe("EnlargeLabel", () => {
  it("goes to the first photo only", () => {
    const label = new EnlargeLabel()
    expect([label.take(), label.take(), label.take()]).toEqual([true, false, false])
  })
})

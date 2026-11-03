import { describe, expect, it } from "vite-plus/test"
import { KeyedTokenBucket } from "./token-bucket.ts"

const makeBucket = (): { bucket: KeyedTokenBucket; advance: (ms: number) => number } => {
  let now = 0
  return { bucket: new KeyedTokenBucket({ burst: 2, perSecond: 1 }, () => now), advance: (ms) => (now += ms) }
}

describe("KeyedTokenBucket", () => {
  it("lets a burst through, then refuses until the allowance refills", () => {
    const { bucket, advance } = makeBucket()
    expect([bucket.take("a").allowed, bucket.take("a").allowed, bucket.take("a").allowed]).toEqual([true, true, false])
    advance(1000)
    expect(bucket.take("a").allowed).toBe(true)
  })

  it("keeps a separate allowance per key", () => {
    const { bucket } = makeBucket()
    bucket.take("a")
    bucket.take("a")
    expect(bucket.take("b").allowed).toBe(true)
  })

  it("reports a refusal once until the key is let through again", () => {
    const { bucket, advance } = makeBucket()
    bucket.take("a")
    bucket.take("a")
    expect(bucket.take("a").firstRefusal).toBe(true)
    expect(bucket.take("a").firstRefusal).toBe(false)
    advance(1000)
    bucket.take("a")
    expect(bucket.take("a").firstRefusal).toBe(true)
  })
})

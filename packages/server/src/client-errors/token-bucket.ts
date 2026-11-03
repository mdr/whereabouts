import type { Instant } from "@whereabouts/shared/units"

export interface BucketLimits {
  /** How many at once. */
  burst: number
  perSecond: number
}

interface Bucket {
  tokens: number
  at: Instant
  /** Refused since last let through: reported once, not on every drop. */
  refusing: boolean
}

/** One allowance per key, refilled over time; a full one is forgotten. */
export class KeyedTokenBucket {
  private readonly buckets = new Map<string, Bucket>()
  private sweptAt: Instant = 0
  private readonly limits: BucketLimits
  private readonly now: () => Instant

  constructor(limits: BucketLimits, now: () => Instant = Date.now) {
    this.limits = limits
    this.now = now
  }

  /** Takes one if there is one. `firstRefusal` is true on the first refusal since the last take. */
  take(key: string): { allowed: boolean; firstRefusal: boolean } {
    const now = this.now()
    if (now - this.sweptAt > 60_000) this.sweep(now)
    const bucket = this.buckets.get(key) ?? { tokens: this.limits.burst, at: now, refusing: false }
    bucket.tokens = this.refilled(bucket, now)
    bucket.at = now
    this.buckets.set(key, bucket)
    if (bucket.tokens < 1) {
      const firstRefusal = !bucket.refusing
      bucket.refusing = true
      return { allowed: false, firstRefusal }
    }
    bucket.tokens -= 1
    bucket.refusing = false
    return { allowed: true, firstRefusal: false }
  }

  private refilled(bucket: Bucket, now: Instant): number {
    return Math.min(this.limits.burst, bucket.tokens + ((now - bucket.at) / 1000) * this.limits.perSecond)
  }

  private sweep(now: Instant): void {
    this.sweptAt = now
    for (const [key, bucket] of this.buckets) {
      if (this.refilled(bucket, now) >= this.limits.burst) this.buckets.delete(key)
    }
  }
}

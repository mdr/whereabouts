/**
 * Connections per client address, checked before a socket is let in: how
 * many may be open at once, and how fast new ones may come. Generous, since
 * a school or household shares one address: a full game (16 players, 8
 * watching) from one network, everyone refreshing, stays well inside both.
 */
import { ConnectionLimiter, logging } from "@rivalis/core"

export interface AddressLimits {
  /** Open connections from one address. */
  maxOpen: number
  /** New connections from one address: this many at once, refilled at `perSecond`. */
  burst: number
  perSecond: number
}

const DEFAULT_ADDRESS_LIMITS: AddressLimits = { maxOpen: 60, burst: 60, perSecond: 1 }

interface Entry {
  open: number
  tokens: number
  at: number
  /** Refused since last let in: logged once, not on every retry. */
  refusing: boolean
}

export class AddressLimiter extends ConnectionLimiter {
  private entries = new Map<string, Entry>()
  private logger = logging.getLogger("connections")
  private sweptAt = 0
  private limits: AddressLimits
  private now: () => number

  constructor(limits: AddressLimits = DEFAULT_ADDRESS_LIMITS, now: () => number = Date.now) {
    super()
    this.limits = limits
    this.now = now
  }

  override check(address: string): boolean {
    const now = this.now()
    if (now - this.sweptAt > 60_000) this.sweep(now)
    const entry = this.entries.get(address) ?? { open: 0, tokens: this.limits.burst, at: now, refusing: false }
    entry.tokens = Math.min(this.limits.burst, entry.tokens + ((now - entry.at) / 1000) * this.limits.perSecond)
    entry.at = now
    this.entries.set(address, entry)
    const why =
      entry.open >= this.limits.maxOpen
        ? `${entry.open} connections open`
        : entry.tokens < 1
          ? "connecting too often"
          : undefined
    if (why) {
      if (!entry.refusing) this.logger.warning(`refusing ${address}: ${why}`)
      entry.refusing = true
      return false
    }
    entry.tokens -= 1
    entry.open += 1
    entry.refusing = false
    return true
  }

  /** The transport calls this when a socket that check let in closes. */
  release(address: string): void {
    const entry = this.entries.get(address)
    if (entry) entry.open -= 1
  }

  /** Forget addresses with nothing open and a full allowance: the same as new ones. */
  private sweep(now: number): void {
    this.sweptAt = now
    for (const [address, entry] of this.entries) {
      const tokens = entry.tokens + ((now - entry.at) / 1000) * this.limits.perSecond
      if (entry.open <= 0 && tokens >= this.limits.burst) this.entries.delete(address)
    }
  }

  /** For tests and diagnostics. */
  openFrom(address: string): number {
    return this.entries.get(address)?.open ?? 0
  }
}

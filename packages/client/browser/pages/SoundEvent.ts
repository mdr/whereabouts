export interface SoundEvent {
  kind: "buffer" | "stop" | "osc"
  /** A recorded clip, known by its length. */
  clip?: string
  freq?: number
  /** performance.now() in the page. */
  at: number
}

declare global {
  interface Window {
    __audio: SoundEvent[]
  }
}

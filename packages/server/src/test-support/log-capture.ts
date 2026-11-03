import type { DestinationStream } from "pino"

export type LogLine = { level: number; event?: string; component?: string; room?: string } & Record<string, unknown>

/** Where a test server's logger writes: each line kept, parsed. */
export class LogCapture implements DestinationStream {
  readonly lines: LogLine[] = []

  write(chunk: string): void {
    for (const text of chunk.split("\n")) if (text) this.lines.push(JSON.parse(text) as LogLine)
  }

  /** The lines that report an event, in the order they were logged. */
  get events(): LogLine[] {
    return this.lines.filter((line) => line.event !== undefined)
  }
}

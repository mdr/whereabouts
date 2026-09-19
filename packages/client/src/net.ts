/**
 * Connection to the game server. Wraps the Rivalis browser client and exposes
 * the latest GameView and connection status as signals.
 */
import { WSClient } from "@rivalis/browser";
import { computed, signal } from "@preact/signals";
import { PROTOCOL_VERSION, encodeTicket, type GameView, type PaintSubmission, type Ticket } from "@whereabouts/shared";

export type Status = "idle" | "connecting" | "connected" | "disconnected" | "rejected";

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export class Connection {
  readonly view = signal<GameView | null>(null);
  readonly status = signal<Status>("idle");
  readonly lastError = signal<string | null>(null);
  /** serverTime - Date.now(), so deadlines can be shown on the local clock. */
  readonly clockOffset = signal(0);
  readonly code = computed(() => this.view.value?.code ?? null);

  private client: WSClient<"state" | "error"> | null = null;
  private decoder = new TextDecoder();

  connect(ticket: Omit<Ticket, "v">): void {
    this.disconnect();
    this.status.value = "connecting";
    this.lastError.value = null;
    const client = new WSClient<"state" | "error">(wsUrl(), {
      ticketSource: "protocol",
      reconnect: { baseDelayMs: 500, maxDelayMs: 5000, maxAttempts: 20 },
      getTicket: () =>
        encodeTicket({ v: PROTOCOL_VERSION, ...ticket, create: false, code: this.code.value ?? ticket.code }),
    });
    client.on("client:connect", () => {
      this.status.value = "connected";
    });
    client.on("client:disconnect", () => {
      if (this.status.value !== "rejected") this.status.value = "disconnected";
    });
    client.on("client:kicked", ({ code, reason }) => {
      this.status.value = "rejected";
      this.lastError.value = reason || (code === 4001 ? "That game code was not found." : `Disconnected (${code}).`);
    });
    client.on("client:reconnect_failed", () => {
      this.status.value = "rejected";
      this.lastError.value ??= "Lost the connection to the game.";
    });
    client.on("client:error", () => {
      /* surfaced via disconnect */
    });
    client.on("state", (payload) => {
      const view = JSON.parse(this.decoder.decode(payload)) as GameView;
      this.clockOffset.value = view.serverTime - Date.now();
      this.view.value = view;
    });
    client.on("error", (payload) => {
      const { message } = JSON.parse(this.decoder.decode(payload)) as { message: string };
      this.lastError.value = message;
    });
    this.client = client;
    client.connect(encodeTicket({ v: PROTOCOL_VERSION, ...ticket }));
  }

  disconnect(): void {
    this.client?.disconnect();
    this.client = null;
    if (this.status.value !== "rejected") this.status.value = "idle";
  }

  private send(topic: string, body: unknown = {}): void {
    if (!this.client?.connected) return;
    this.client.send(topic, JSON.stringify(body));
  }

  sendPaint(paint: PaintSubmission): void {
    this.send("paint", paint);
  }
  lock(): void {
    this.send("lock");
  }
  ready(): void {
    this.send("ready");
  }
  start(): void {
    this.send("start");
  }
  next(): void {
    this.send("next");
  }
  again(): void {
    this.send("again");
  }
  rename(name: string): void {
    this.send("rename", { name });
  }

  /** Local-clock ms until a server deadline. */
  msUntil(serverEpochMs: number): number {
    return serverEpochMs - (Date.now() + this.clockOffset.value);
  }
}

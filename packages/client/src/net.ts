/**
 * Connection to the game server. Wraps the Rivalis browser client and exposes
 * the latest GameView and connection status as signals.
 */
import { WSClient } from "@rivalis/browser";
import { computed, signal } from "@preact/signals";
import {
  type ConfigurePatch,
  PROTOCOL_VERSION,
  encodeTicket,
  type GameView,
  type PaintSubmission,
  type Ticket,
} from "@whereabouts/shared";

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
  /** Why the server turned us away or closed the game, in words for the player. */
  readonly rejection = signal<Rejection | null>(null);
  readonly code = computed(() => this.view.value?.code ?? null);

  private client: WSClient<"state" | "error"> | null = null;
  private decoder = new TextDecoder();

  connect(ticket: Omit<Ticket, "v">): void {
    this.disconnect();
    this.status.value = "connecting";
    this.lastError.value = null;
    this.rejection.value = null;
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
      this.rejection.value = describeDisconnect(code, reason);
    });
    client.on("client:reconnect_failed", () => {
      this.status.value = "rejected";
      this.rejection.value ??= describeDisconnect(0, "reconnect_failed");
    });
    client.on("client:error", () => {
      /* surfaced via disconnect */
    });
    client.on("state", (payload) => {
      const view = JSON.parse(this.decoder.decode(payload)) as GameView;
      this.clockOffset.value = view.serverTime - Date.now();
      this.view.value = view;
      // A fresh state means the server is happy with us; stop showing an old complaint.
      this.lastError.value = null;
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
  configure(patch: ConfigurePatch): void {
    this.send("configure", patch);
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
  kick(playerId: string): void {
    this.send("kick", { playerId });
  }
  end(): void {
    this.send("end");
  }

  /** Local-clock ms until a server deadline. */
  msUntil(serverEpochMs: number): number {
    return serverEpochMs - (Date.now() + this.clockOffset.value);
  }
}

export interface Rejection {
  title: string;
  detail: string;
  /** Set when the host removed this player; the client then forgets its seat token. */
  removed?: boolean;
}

/**
 * Turn a WebSocket close code and the server's reason string into something a
 * player can act on. Reasons come from Rivalis (room lifecycle) and from our
 * own room (join rejections, superseded tabs).
 */
export function describeDisconnect(code: number, reason: string | undefined): Rejection {
  const r = (reason ?? "").toLowerCase();
  if (r === "room_destroyed") {
    return {
      title: "That game has ended",
      detail: "Everyone left, so the room was closed. Game codes only live while someone is in the game.",
    };
  }
  if (r.includes("removed by the host")) {
    return {
      title: "You were removed from the game",
      detail: "The host took you out of this game. You can rejoin with the code as a new player, or start your own.",
      removed: true,
    };
  }
  if (r.includes("game has finished")) {
    return { title: "That game has finished", detail: "The final results are in. Ask the host to start a new game." };
  }
  if (r.includes("replaced by a newer connection")) {
    return {
      title: "You joined from another tab",
      detail: "This game is now open in your newer tab, so this one has been signed out.",
    };
  }
  if (r === "reconnect_failed") {
    return {
      title: "Lost the connection",
      detail: "We could not reach the game server again. Check your network and rejoin.",
    };
  }
  if (code === 4001 || code === 1008 || r.includes("unauthor") || r.includes("not found") || r.includes("rejected")) {
    return {
      title: "No game with that code",
      detail: "Check the code with your host. If the game finished or everyone left, it will need starting again.",
    };
  }
  return { title: "Disconnected", detail: reason ? reason : `The connection closed (code ${code}).` };
}

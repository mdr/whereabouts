/**
 * Rivalis adapter: one GameRoom per game code, each owning a pure Game.
 * This is the only module that knows about Rivalis rooms and actors; the
 * Game itself is I/O free and tested on its own.
 */
import {
  type Actor,
  AuthMiddleware,
  Room,
  type AuthResult,
  type ConnectionContext,
  type RoomManager,
} from "@rivalis/core";
import { type z } from "zod";
import {
  ClientMessageSchemas,
  Game,
  MAX_PAINT_CELLS,
  QUESTIONS,
  ServerTopics,
  decodeMessage,
  decodeTicket,
  encodeMessage,
  generateCode,
  type GameConfig,
  type Question,
} from "@whereabouts/shared";

export interface ActorData {
  token: string;
  name: string;
}

export const ROOM_TYPE = "game";

/** Injected clock so tests can drive time. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface GameRoomDeps {
  clock: Clock;
  pool: Question[];
  config: Partial<GameConfig>;
}

/** Set once at startup; rooms are constructed by Rivalis so cannot take arguments. */
let deps: GameRoomDeps = { clock: realClock, pool: QUESTIONS, config: {} };
export function configureGameRooms(next: Partial<GameRoomDeps>): void {
  deps = { ...deps, ...next };
}

export class GameRoom extends Room<ActorData> {
  protected override destroyOnEmpty = true;
  protected override unknownTopicPolicy = "drop" as const;

  // Rivalis runs onCreate from the base constructor, before subclass field
  // initialisers. `declare` fields emit no initialiser, so values assigned in
  // onCreate survive; anything with `= ...` here would be reset afterwards.
  declare private game: Game;
  declare private actorsByToken: Map<string, Actor<ActorData>>;
  declare private timer: unknown;

  protected override onCreate(): void {
    this.game = new Game(this.id, deps.pool, deps.config);
    this.actorsByToken = new Map();
    this.timer = null;
    for (const [topic, schema] of Object.entries(ClientMessageSchemas)) {
      this.bind(topic, (actor, payload) => this.handle(actor, topic, schema, payload));
    }
  }

  protected override onJoin(actor: Actor<ActorData>): void {
    const { token, name } = actor.data!;
    const previous = this.actorsByToken.get(token);
    if (previous && previous !== actor) previous.kick("replaced by a newer connection");
    this.actorsByToken.set(token, actor);
    const result = this.game.join(token, name, deps.clock.now());
    if (!result.ok) {
      actor.send(ServerTopics.error, encodeMessage({ message: result.error }));
      actor.kick(result.error);
      return;
    }
    this.broadcastState();
  }

  protected override onLeave(actor: Actor<ActorData>): void {
    const { token } = actor.data!;
    if (this.actorsByToken.get(token) !== actor) return; // superseded by a reconnect
    this.actorsByToken.delete(token);
    this.game.disconnect(token, deps.clock.now());
    this.broadcastState();
  }

  protected override onDestroy(): void {
    this.clearTimer();
  }

  private handle(actor: Actor<ActorData>, topic: string, schema: z.ZodType, payload: Uint8Array): void {
    let body: unknown;
    try {
      body = decodeMessage(payload);
    } catch {
      this.sendError(actor, "malformed message");
      return;
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      this.sendError(actor, `invalid ${topic}`);
      return;
    }
    const token = actor.data!.token;
    const now = deps.clock.now();
    const result = this.dispatch(topic, token, parsed.data, now);
    if (!result.ok) {
      this.sendError(actor, result.error);
      return;
    }
    if (result.changed) this.broadcastState();
    else if (topic === "paint") this.sendState(actor); // echo lock/paint status to the sender only
  }

  private dispatch(topic: string, token: string, data: unknown, now: number) {
    switch (topic) {
      case "paint": {
        const paint = data as z.infer<typeof ClientMessageSchemas.paint>;
        if (Object.keys(paint.cells).length > MAX_PAINT_CELLS) return { ok: false as const, error: "too many cells" };
        return this.game.setPaint(token, paint);
      }
      case "lock":
        return this.game.lock(token, now);
      case "ready":
        return this.game.ready(token, now);
      case "configure":
        return this.game.configure(token, data as z.infer<typeof ClientMessageSchemas.configure>);
      case "start":
        return this.game.start(token, now);
      case "next":
        return this.game.next(token, now);
      case "again":
        return this.game.again(token, now);
      case "rename":
        return this.game.rename(token, (data as z.infer<typeof ClientMessageSchemas.rename>).name);
      case "kick":
        return this.removePlayer(token, (data as z.infer<typeof ClientMessageSchemas.kick>).playerId, now);
      case "end":
        return this.game.end(token);
      default:
        return { ok: false as const, error: "unknown topic" };
    }
  }

  /** Remove a player from the game and close their connection, telling them why. */
  private removePlayer(token: string, playerId: string, now: number) {
    const target = this.game.tokenOf(playerId);
    const result = this.game.kick(token, playerId, now);
    if (result.ok && target !== undefined) this.actorsByToken.get(target)?.kick("removed by the host");
    return result;
  }

  private sendError(actor: Actor<ActorData>, message: string): void {
    actor.send(ServerTopics.error, encodeMessage({ message }));
  }

  private sendState(actor: Actor<ActorData>): void {
    const now = deps.clock.now();
    actor.send(ServerTopics.state, encodeMessage(this.game.view(actor.data!.token, now)));
  }

  /** Views are per player (host flag, lock state), so send individually. */
  private broadcastState(): void {
    const now = deps.clock.now();
    this.each((actor) => {
      actor.send(ServerTopics.state, encodeMessage(this.game.view(actor.data!.token, now)));
    });
    this.joinable = this.game.phase !== "results";
    this.armTimer();
  }

  private armTimer(): void {
    this.clearTimer();
    const at = this.game.nextWakeAt();
    if (at === null) return;
    const delay = Math.max(0, at - deps.clock.now());
    this.timer = deps.clock.setTimeout(() => {
      this.timer = null;
      if (this.game.tick(deps.clock.now())) this.broadcastState();
      else this.armTimer();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) deps.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Test hook. */
  get state(): Game {
    return this.game;
  }
}

/**
 * Parses the ticket, creates the room for hosts, and routes joiners to their
 * game by code. Rivalis rejects the join itself if the room is full or not
 * joinable.
 */
export class GameAuth extends AuthMiddleware<ActorData> {
  private rooms: () => RoomManager<ActorData>;

  constructor(rooms: () => RoomManager<ActorData>) {
    super();
    this.rooms = rooms;
  }

  override async authenticate(ticket: string, _context?: ConnectionContext): Promise<AuthResult<ActorData> | null> {
    const parsed = decodeTicket(ticket);
    if (!parsed) return null;
    const rooms = this.rooms();
    let roomId: string;
    if (parsed.create) {
      roomId = generateCode();
      for (let i = 0; i < 20 && rooms.get(roomId); i++) roomId = generateCode();
      if (rooms.get(roomId)) return null;
      rooms.create(ROOM_TYPE, roomId);
    } else if (parsed.code && rooms.get(parsed.code)) {
      roomId = parsed.code;
    } else {
      return null;
    }
    return { data: { token: parsed.token, name: parsed.name }, roomId };
  }
}

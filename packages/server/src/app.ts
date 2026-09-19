/**
 * Builds the Fastify app and the Rivalis game server on its underlying
 * http.Server. Exported as a factory so tests can start it on port 0.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { Rivalis } from "@rivalis/core";
import WSTransport from "./vendor/WSTransport.ts";
import { GameAuth, GameRoom, ROOM_TYPE, type ActorData } from "./rooms.ts";

export interface AppOptions {
  /** Directory of built client files to serve, or null for API-only (dev, behind Vite). */
  staticDir: string | null;
  allowedOrigins?: string[];
  logger?: boolean;
  /** Rivalis log level; defaults to info. */
  logLevel?: Rivalis["logging"]["level"];
}

export interface App {
  fastify: FastifyInstance;
  rivalis: Rivalis<ActorData>;
  listen(port: number, host?: string): Promise<string>;
  close(): Promise<void>;
}

/** 1 MiB. A dense paint submission can exceed the 64 KiB default. */
const MAX_PAYLOAD_BYTES = 1024 * 1024;

export function createApp(options: AppOptions): App {
  const fastify = Fastify({ logger: options.logger ?? false });

  fastify.get("/api/health", () => ({ ok: true }));

  if (options.staticDir) {
    fastify.register(fastifyStatic, { root: options.staticDir, wildcard: false });
    // Single-page app: unknown paths fall through to index.html.
    fastify.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
  }

  let rivalis: Rivalis<ActorData> | null = null;
  const rooms = () => {
    if (!rivalis) throw new Error("rivalis not ready");
    return rivalis.rooms;
  };
  const transport = new WSTransport({ server: fastify.server, path: "/ws" }, null, {
    maxPayload: MAX_PAYLOAD_BYTES,
    ticketSource: "protocol",
    allowedOrigins: options.allowedOrigins ?? (() => true),
  });
  rivalis = new Rivalis<ActorData>({
    transports: [transport],
    authMiddleware: new GameAuth(rooms),
    maxPayloadBytes: MAX_PAYLOAD_BYTES,
  });
  if (options.logLevel) rivalis.logging.level = options.logLevel;
  rivalis.rooms.define(ROOM_TYPE, GameRoom);

  return {
    fastify,
    rivalis,
    async listen(port, host = "127.0.0.1") {
      const address = await fastify.listen({ port, host });
      return address;
    },
    async close() {
      await rivalis.shutdown({ timeoutMs: 2000 });
      await fastify.close();
    },
  };
}

export function defaultStaticDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../client/dist");
}

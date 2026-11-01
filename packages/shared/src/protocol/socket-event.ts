/** The socket library's own events, as it names them; it exports no constants. Literal types, so its typed listeners apply. */
export const SocketEvent = {
  CONNECT: "client:connect",
  DISCONNECT: "client:disconnect",
  KICKED: "client:kicked",
  RECONNECTING: "client:reconnecting",
  RECONNECT_FAILED: "client:reconnect_failed",
  ERROR: "client:error"
} as const

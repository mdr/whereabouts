import type { Rejection } from "../net/rejection"

export enum ConnectionStatus {
  IDLE = "IDLE",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  REJECTED = "REJECTED"
}

export type PlainStatus = Exclude<ConnectionStatus, ConnectionStatus.REJECTED>

interface PlainState {
  type: PlainStatus
}

/** Turned away or closed out; `rejection` says why, in words for the player. */
interface RejectedState {
  type: ConnectionStatus.REJECTED
  rejection: Rejection
}

export type ConnectionState = PlainState | RejectedState

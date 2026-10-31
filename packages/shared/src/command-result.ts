import type { CloseReason } from "./close-reason.ts"

export type CommandResult = { ok: true; changed: boolean } | { ok: false; error: string }
export type JoinResult = { ok: true; changed: boolean } | { ok: false; reason: CloseReason }

export const OK_CHANGED = { ok: true, changed: true } as const
export const OK_SAME: CommandResult = { ok: true, changed: false }
export const fail = (error: string): CommandResult => ({ ok: false, error })

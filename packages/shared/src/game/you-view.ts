/** What a seat's own role looks like to it, in each phase. */
import { Role, YouRoleType, type RoundYouRole, type YouRole } from "../roles.ts"
import type { Seat } from "./seats.ts"
import { lockedIn, playsRound, type InPlayState } from "./state.ts"

const SPECTATING = { type: YouRoleType.SPECTATOR } as const

/** Your role in the lobby or on the final results. */
export const seatedRole = ({ role }: Seat): YouRole =>
  role.type === Role.PLAYER ? { type: YouRoleType.PLAYING, colour: role.colour } : SPECTATING

/** Your role on the round under way or on show. */
export function roundRole(s: InPlayState, seat: Seat, hints: number): RoundYouRole {
  const { role } = seat
  if (role.type === Role.SPECTATOR) return SPECTATING
  if (!playsRound(role, s.round)) return { type: YouRoleType.JOINED_LATE, colour: role.colour }
  return {
    type: YouRoleType.PLAYING,
    colour: role.colour,
    locked: lockedIn(s, seat.token),
    hintsLeft: Math.max(0, hints - role.record.hintsUsed)
  }
}

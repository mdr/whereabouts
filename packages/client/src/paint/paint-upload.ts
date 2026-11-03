import { useEffect, useRef } from "preact/hooks"
import { compactRecord } from "@whereabouts/shared/paint/compact"
import { Phase, type InPlayGameView } from "@whereabouts/shared/protocol/views"
import { YouRoleType } from "@whereabouts/shared/roles"
import { canPaint } from "../round/editing"
import { type Connection, ConnectionStatus } from "../net/net"
import type { PaintController } from "./paint-controller"
import { announcePass } from "../round/round"

type UploadConnection = Pick<Connection, "status" | "sendPaint" | "lock">
export type UploadPaint = Pick<PaintController, "layer" | "floor" | "version">

/**
 * Keeps the server's copy of your paint current while you can paint, and
 * gives Done (`lockIn`), which uploads before locking.
 */
export const usePaintUpload = (
  conn: UploadConnection,
  paint: UploadPaint,
  view: InPlayGameView,
  timeUp: boolean
): { lockIn: () => void } => {
  const guessing = view.phase === Phase.GUESSING
  const { role } = view.you
  const locked = role.type === YouRoleType.PLAYING && role.locked
  const editing = canPaint(view, timeUp)
  const round = view.phase === Phase.GUESSING ? view.round.index : undefined
  const sendTimer = useRef<number | undefined>(undefined)

  /** Upload the paint now. An empty map is sent too: it takes back paint sent earlier. */
  const sendNow = (): void => {
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = undefined
    const { paintUploads } = window.testHooks
    paintUploads.attempted++
    if (conn.status.peek().type === ConnectionStatus.CONNECTED) paintUploads.sent++
    conn.sendPaint({ cells: compactRecord(paint.layer.toRecord()), floor: paint.floor.peek() })
  }

  const version = paint.version.value
  const floor = paint.floor.value
  useEffect(() => {
    if (!editing) return
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = window.setTimeout(sendNow, 400)
    return () => {
      if (sendTimer.current) clearTimeout(sendTimer.current)
    }
  }, [version, floor, editing])

  useEffect(() => {
    if (timeUp && guessing && role.type === YouRoleType.PLAYING && !locked) sendNow()
  }, [timeUp])

  // The round Done was last pressed in, until the server has us locked: a
  // press while the connection is down is sent again once it is back.
  const lockWish = useRef<{ round: number | undefined } | undefined>(undefined)
  if (locked) lockWish.current = undefined

  // Uploads made while the connection was down were lost. Once the server
  // has us back (its first state since), send the paint again.
  const status = conn.status.value.type
  const resend = useRef(false)
  useEffect(() => {
    if (status !== ConnectionStatus.CONNECTED) resend.current = true
  }, [status])
  useEffect(() => {
    if (!resend.current || status !== ConnectionStatus.CONNECTED) return
    resend.current = false
    if (!editing) return
    sendNow()
    if (lockWish.current && lockWish.current.round === round) conn.lock()
  }, [view])

  // Done with paint freezes it; Done with nothing painted is a pass, which
  // scores PASS_SCORE and lets the round end without waiting on you.
  const lockIn = (): void => {
    announcePass(paint)
    lockWish.current = { round }
    sendNow()
    conn.lock()
  }

  return { lockIn }
}

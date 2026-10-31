import { useEffect, useRef } from "preact/hooks"
import { compactRecord } from "@whereabouts/shared/paint"
import type { GameView } from "@whereabouts/shared/protocol"
import type { Connection } from "./net"
import type { PaintController } from "./paint-controller"
import { announcePass } from "./round"

type UploadConnection = Pick<Connection, "status" | "sendPaint" | "lock">
type UploadPaint = Pick<PaintController, "layer" | "floor" | "version">

/**
 * Keeps the server's copy of your paint current while you can paint, and
 * gives Done (`lockIn`), which uploads before locking.
 */
export function usePaintUpload(
  conn: UploadConnection,
  paint: UploadPaint,
  view: GameView,
  timeUp: boolean
): { lockIn: () => void } {
  const guessing = view.phase === "guessing"
  const sittingOut = view.you.watching || view.you.spectating
  const locked = view.you.locked
  const sendTimer = useRef<number | undefined>(undefined)

  /** Upload the paint now. An empty map is sent too: it takes back paint sent earlier. */
  function sendNow() {
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = undefined
    conn.sendPaint({ cells: compactRecord(paint.layer.toRecord()), floor: paint.floor.peek() })
  }

  const version = paint.version.value
  const floor = paint.floor.value
  useEffect(() => {
    if (!guessing || sittingOut || locked || timeUp) return
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = window.setTimeout(sendNow, 400)
    return () => {
      if (sendTimer.current) clearTimeout(sendTimer.current)
    }
  }, [version, floor, guessing])

  useEffect(() => {
    if (timeUp && guessing && !sittingOut && !locked) sendNow()
  }, [timeUp])

  // Uploads made while the connection was down were lost. Once the server
  // has us back (its first state since), send the paint again.
  const status = conn.status.value
  const resend = useRef(false)
  useEffect(() => {
    if (status !== "connected") resend.current = true
  }, [status])
  useEffect(() => {
    if (!resend.current || status !== "connected") return
    resend.current = false
    if (guessing && !sittingOut && !locked && !timeUp) sendNow()
  }, [view])

  // Done with paint freezes it; Done with nothing painted is a pass, which
  // scores PASS_SCORE and lets the round end without waiting on you.
  function lockIn() {
    announcePass(paint)
    sendNow()
    conn.lock()
  }

  return { lockIn }
}

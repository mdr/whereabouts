import type { ComponentChildren, TargetedEvent } from "preact"
import { createPortal } from "preact/compat"
import { useEffect, useRef, useState } from "preact/hooks"
import { CLOSE } from "../../keyboard/shortcuts"
import { useElementRef } from "../element-ref"
import { cx } from "../cx"
import lb from "./Lightbox.module.css"
import type { Px } from "@whereabouts/shared/units"

interface Position {
  x: Px
  y: Px
}

/** Calls `close` on Escape while `open`. */
export function useEscape(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (CLOSE.matches(e)) close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
}

const MAX_ZOOM = 6
const CLICK_ZOOM = 2.5

export enum LightboxType {
  PHOTO = "PHOTO",
  FLAG = "FLAG"
}

const TYPE_CLASS: Record<LightboxType, string | undefined> = {
  [LightboxType.PHOTO]: lb.photo,
  [LightboxType.FLAG]: lb.flag
}

/**
 * The enlarged photo or flag. Scroll or pinch to zoom about the pointer, drag to pan
 * once zoomed, click the picture to jump between fit and a closer look, and
 * click the backdrop, the close button or press Escape to leave. A photo is
 * a larger rendition than the thumbnail's, so zooming has detail to show.
 */
export function Lightbox({
  src,
  type,
  ratio,
  credit,
  onClose
}: {
  src: string
  type: LightboxType
  /** Width over height, to show it as large as fits: a flag's SVG has no size of its own, and a photo may start small. */
  ratio?: number
  credit: ComponentChildren
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 })
  const frame = useElementRef<HTMLDivElement>()
  const pointers = useRef(new Map<number, Position>())
  const pinchDist = useRef<Px | undefined>(undefined)
  const dragged = useRef(false)

  /** Zoom by `factor` keeping the point (cx, cy), relative to the frame centre, fixed. */
  function zoomAt(factor: number, cx: Px, cy: Px) {
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom * factor))
    if (next === zoom) return
    const k = next / zoom
    setPan(next === 1 ? { x: 0, y: 0 } : { x: pan.x * k + cx * (1 - k), y: pan.y * k + cy * (1 - k) })
    setZoom(next)
  }
  /** Client coordinates to an offset from the frame centre. */
  function fromCentre(clientX: Px, clientY: Px) {
    const r = frame.current?.getBoundingClientRect()
    if (!r) return { cx: 0, cy: 0 }
    return { cx: clientX - (r.left + r.width / 2), cy: clientY - (r.top + r.height / 2) }
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const { cx, cy } = fromCentre(e.clientX, e.clientY)
    zoomAt(Math.exp(-e.deltaY * 0.002), cx, cy)
  }
  const onPointerDown = (e: TargetedEvent<HTMLElement, PointerEvent>) => {
    // Captured, the click that follows goes to the frame, so onClick lives there; the credit link keeps its own.
    if (!(e.target as Element).closest("a")) e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragged.current = false
    if (pointers.current.size === 2) pinchDist.current = pinchDistance()
  }
  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinchDist.current) {
      const dist = pinchDistance()
      const [a, b] = [...pointers.current.values()]
      const { cx, cy } = fromCentre((a!.x + b!.x) / 2, (a!.y + b!.y) / 2)
      zoomAt(dist / pinchDist.current, cx, cy)
      pinchDist.current = dist
      dragged.current = true
    } else if (pointers.current.size === 1 && zoom > 1) {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true
      setPan({ x: pan.x + dx, y: pan.y + dy })
    }
  }
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchDist.current = undefined
  }
  function pinchDistance() {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1
  }
  const onFrameClick = (e: MouseEvent) => {
    e.stopPropagation()
    if ((e.target as Element).closest("a")) return
    if (dragged.current) return // the end of a drag or pinch, not a click
    if (zoom > 1) zoomAt(1 / zoom, 0, 0)
    else {
      const { cx, cy } = fromCentre(e.clientX, e.clientY)
      zoomAt(CLICK_ZOOM, cx, cy)
    }
  }

  // Into <body>: a sticky table cell, say, would otherwise hold it under the cells below.
  return createPortal(
    <div
      class={lb.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label="Picture"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      title="Scroll or pinch to zoom, drag to pan; click the backdrop or press Escape to close"
    >
      <button class={lb.close} aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div
        class={cx(lb.frame, zoom > 1 && lb.zoomed)}
        ref={frame}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onFrameClick}
      >
        <img
          src={src}
          class={cx(TYPE_CLASS[type], ratio !== undefined && lb.fit)}
          alt=""
          referrerpolicy="no-referrer"
          draggable={false}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            ...(ratio && { "--ratio": String(ratio) })
          }}
        />
        {credit}
      </div>
    </div>,
    document.body
  )
}

import type { ComponentChildren, TargetedEvent } from "preact"
import { createPortal } from "preact/compat"
import { useRef, useState } from "preact/hooks"
import { useElementRef } from "../../element-ref"
import { onDialogCancel, useModalDialog } from "../../modal-dialog"
import { cx } from "../../cx"
import styles from "./Lightbox.module.css"
import { CLICK_ZOOM, nextZoom, type Position } from "./lightbox-zoom"
import { lightboxTestIds } from "./LightboxTestIds"
import type { Px } from "@whereabouts/shared/units"

export enum LightboxType {
  PHOTO = "PHOTO",
  FLAG = "FLAG"
}

const TYPE_CLASS: Record<LightboxType, string | undefined> = {
  [LightboxType.PHOTO]: styles.photo,
  [LightboxType.FLAG]: styles.flag
}

/**
 * The enlarged photo or flag. Scroll or pinch to zoom about the pointer, drag to pan
 * once zoomed, click the picture to jump between fit and a closer look, and
 * click the backdrop, the close button or press Escape to leave. A photo is
 * a larger rendition than the thumbnail's, so zooming has detail to show.
 */
export const Lightbox = ({
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
}) => {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 })
  const frame = useElementRef<HTMLDivElement>()
  const pointers = useRef(new Map<number, Position>())
  const pinchDist = useRef<Px | undefined>(undefined)
  const dragged = useRef(false)
  const dialogRef = useModalDialog()

  /** Zoom by `factor` keeping the point (cx, cy), relative to the frame centre, fixed. */
  const zoomAt = (factor: number, cx: Px, cy: Px) => {
    const next = nextZoom({ zoom, pan }, factor, { x: cx, y: cy })
    if (!next) return
    setPan(next.pan)
    setZoom(next.zoom)
  }
  /** Client coordinates to an offset from the frame centre. */
  const fromCentre = (clientX: Px, clientY: Px) => {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect) return { cx: 0, cy: 0 }
    return { cx: clientX - (rect.left + rect.width / 2), cy: clientY - (rect.top + rect.height / 2) }
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const { cx, cy } = fromCentre(event.clientX, event.clientY)
    zoomAt(Math.exp(-event.deltaY * 0.002), cx, cy)
  }
  const onPointerDown = (event: TargetedEvent<HTMLElement, PointerEvent>) => {
    // Captured, the click that follows goes to the frame, so onClick lives there; the credit link keeps its own.
    if (!(event.target as Element).closest("a")) event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    dragged.current = false
    if (pointers.current.size === 2) pinchDist.current = pinchDistance()
  }
  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2 && pinchDist.current) {
      const dist = pinchDistance()
      const [first, second] = [...pointers.current.values()]
      const { cx, cy } = fromCentre((first!.x + second!.x) / 2, (first!.y + second!.y) / 2)
      zoomAt(dist / pinchDist.current, cx, cy)
      pinchDist.current = dist
      dragged.current = true
    } else if (pointers.current.size === 1 && zoom > 1) {
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true
      setPan({ x: pan.x + dx, y: pan.y + dy })
    }
  }
  const onPointerUp = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinchDist.current = undefined
  }
  const pinchDistance = () => {
    const [first, second] = [...pointers.current.values()]
    return Math.hypot(first!.x - second!.x, first!.y - second!.y) || 1
  }
  const onFrameClick = (event: MouseEvent) => {
    event.stopPropagation()
    if ((event.target as Element).closest("a")) return
    if (dragged.current) return // the end of a drag or pinch, not a click
    if (zoom > 1) zoomAt(1 / zoom, 0, 0)
    else {
      const { cx, cy } = fromCentre(event.clientX, event.clientY)
      zoomAt(CLICK_ZOOM, cx, cy)
    }
  }

  // Into <body>: a sticky table cell, say, would otherwise hold it under the cells below.
  return createPortal(
    <dialog
      ref={dialogRef}
      class={styles.lightbox}
      data-testid={lightboxTestIds.lightbox}
      aria-label="Picture"
      tabIndex={-1}
      onCancel={onDialogCancel(onClose)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      title="Scroll or pinch to zoom, drag to pan; click the backdrop or press Escape to close"
    >
      <button class={styles.close} aria-label="Close" onClick={onClose} data-testid={lightboxTestIds.close}>
        ×
      </button>
      <div
        class={cx(styles.frame, zoom > 1 && styles.zoomed)}
        ref={frame}
        data-testid={lightboxTestIds.frame}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onFrameClick}
      >
        <img
          src={src}
          class={cx(TYPE_CLASS[type], ratio !== undefined && styles.fit)}
          alt=""
          referrerpolicy="no-referrer"
          draggable={false}
          data-testid={lightboxTestIds.picture}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            ...(ratio && { "--ratio": String(ratio) })
          }}
        />
        {credit}
      </div>
    </dialog>,
    document.body
  )
}

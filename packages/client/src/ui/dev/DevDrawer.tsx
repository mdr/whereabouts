/**
 * Right-hand drawer with playtest information and cheats. Renders nothing
 * unless dev mode is on, so screens can include it unconditionally.
 */
import type { ComponentChildren } from "preact"
import { devMode } from "./dev"
import { devDrawerTestIds } from "./DevDrawerTestIds"
import { cx } from "../cx"
import kit from "../kit.module.css"
import s from "./DevDrawer.module.css"

export function DevDrawer({ children }: { children?: ComponentChildren }) {
  if (!devMode.value) return undefined
  return (
    <aside class={s.drawer} data-testid={devDrawerTestIds.drawer}>
      <div class={s.head}>
        <span class={s.badge} data-testid={devDrawerTestIds.badge}>
          DEV
        </span>
        <span class={cx(kit.hint, s.note)}>Playtest tools. Add ?dev to the URL to get here.</span>
        <button class="small" onClick={() => (devMode.value = false)}>
          Hide
        </button>
      </div>
      {children}
    </aside>
  )
}

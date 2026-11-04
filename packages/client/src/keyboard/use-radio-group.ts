import type { TargetedEvent } from "preact"
import { radioTabStopIndex, radioTargetIndex } from "./radio-group"

interface RadioGroup {
  groupProps: { onKeyDown: (event: TargetedEvent<HTMLElement, KeyboardEvent>) => void }
  tabIndex: (index: number) => number
}

/**
 * Keyboard behaviour for a `role="radiogroup"` of `role="radio"` buttons: one
 * Tab stop, and arrows (and Home/End) move to an option and select it.
 * Spread `groupProps` on the group and give option `i` `tabIndex={tabIndex(i)}`.
 */
export const useRadioGroup = ({
  checkedIndex,
  select
}: {
  /** The checked option's index; -1 for none. */
  checkedIndex: number
  select: (index: number) => void
}): RadioGroup => ({
  groupProps: {
    onKeyDown: (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'))
      const current = radios.indexOf(event.target as HTMLElement)
      if (current < 0) return
      const target = radioTargetIndex(event.key, current, radios.length)
      if (target === undefined) return
      event.preventDefault()
      radios[target]!.focus()
      select(target)
    }
  },
  tabIndex: (index) => (index === radioTabStopIndex(checkedIndex) ? 0 : -1)
})

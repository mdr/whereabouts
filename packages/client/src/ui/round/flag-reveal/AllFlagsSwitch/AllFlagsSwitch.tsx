import { allFlags } from "../../../../settings/settings"
import { cx } from "../../../cx"
import kit from "../../../kit.module.css"
import { allFlagsSwitchTestIds } from "./AllFlagsSwitchTestIds"

/** The switch for AllFlags. */
export function AllFlagsSwitch() {
  return (
    <label class={cx(kit.check, kit.switch)}>
      <input
        type="checkbox"
        role="switch"
        checked={allFlags.value}
        onChange={(e) => (allFlags.value = e.currentTarget.checked)}
        data-testid={allFlagsSwitchTestIds.allFlagsSwitch}
      />
      Show all flags
    </label>
  )
}

import { allFlags } from "../../../../settings/settings"
import { cx } from "../../../cx"
import kit from "../../../kit.module.css"
import { allFlagsSwitchTestIds } from "./AllFlagsSwitchTestIds"

/** The switch for AllFlags. */
export const AllFlagsSwitch = () => {
  return (
    <label class={cx(kit.check, kit.switch)}>
      <input
        type="checkbox"
        role="switch"
        checked={allFlags.value}
        onChange={(event) => (allFlags.value = event.currentTarget.checked)}
        data-testid={allFlagsSwitchTestIds.allFlagsSwitch}
      />
      Show all flags
    </label>
  )
}

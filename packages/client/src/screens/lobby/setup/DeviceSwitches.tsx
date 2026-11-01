import { globeView, soundOn, startOnPan } from "../../../settings/settings"
import { cx } from "../../../ui/cx"
import kit from "../../../ui/kit.module.css"
import { deviceSwitchesTestIds } from "./DeviceSwitchesTestIds"

export function DeviceSwitches() {
  return (
    <>
      <label class={cx(kit.check, kit.switch)}>
        <input
          type="checkbox"
          role="switch"
          data-testid={deviceSwitchesTestIds.startOnPanSwitch}
          checked={startOnPan.value}
          onChange={(e) => (startOnPan.value = e.currentTarget.checked)}
        />
        Start each round with the Pan tool (handy on a tablet)
      </label>
      <label class={cx(kit.check, kit.switch)}>
        <input
          type="checkbox"
          role="switch"
          checked={soundOn.value}
          onChange={(e) => (soundOn.value = e.currentTarget.checked)}
        />
        Sounds (spray, countdown and round cues)
      </label>
      <label class={cx(kit.check, kit.switch)}>
        <input
          type="checkbox"
          role="switch"
          checked={globeView.value}
          onChange={(e) => (globeView.value = e.currentTarget.checked)}
        />
        Paint on a globe
      </label>
    </>
  )
}

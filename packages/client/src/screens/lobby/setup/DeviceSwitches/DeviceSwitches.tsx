import { globeView, soundOn, startOnPan } from "../../../../settings/settings"
import { cx } from "../../../../ui/cx"
import kit from "../../../../ui/kit.module.css"
import { deviceSwitchesTestIds } from "./DeviceSwitchesTestIds"

export const DeviceSwitches = () => (
  <>
    <label class={cx(kit.check, kit.switch)}>
      <input
        type="checkbox"
        role="switch"
        data-testid={deviceSwitchesTestIds.startOnPanSwitch}
        checked={startOnPan.value}
        onChange={(event) => (startOnPan.value = event.currentTarget.checked)}
      />
      Start each round with the Pan tool (handy on a tablet)
    </label>
    <label class={cx(kit.check, kit.switch)}>
      <input
        type="checkbox"
        role="switch"
        checked={soundOn.value}
        onChange={(event) => (soundOn.value = event.currentTarget.checked)}
      />
      Sounds (spray, countdown and round cues)
    </label>
    <label class={cx(kit.check, kit.switch)}>
      <input
        type="checkbox"
        role="switch"
        checked={globeView.value}
        onChange={(event) => (globeView.value = event.currentTarget.checked)}
      />
      Paint on a globe
    </label>
  </>
)

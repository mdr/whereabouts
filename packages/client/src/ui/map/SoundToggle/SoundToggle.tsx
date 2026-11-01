import { Icon } from "../../icons"
import { soundOn } from "../../../settings/settings"
import { cx } from "../../cx"
import { soundToggleTestIds } from "./SoundToggleTestIds"
import s from "./SoundToggle.module.css"

/** The per-device sound switch as a speaker button. */
export function SoundToggle() {
  const on = soundOn.value
  return (
    <button
      type="button"
      class={cx("icon", s.soundToggle)}
      data-testid={soundToggleTestIds.button}
      aria-pressed={on}
      aria-label={on ? "Sounds on: turn off" : "Sounds off: turn on"}
      title={on ? "Turn sounds off" : "Turn sounds on"}
      onClick={() => (soundOn.value = !on)}
    >
      <Icon name={on ? "soundOn" : "soundOff"} />
    </button>
  )
}

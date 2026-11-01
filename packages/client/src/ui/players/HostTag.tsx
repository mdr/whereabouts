import { Icon } from "../icons"
import { hostTagTestIds } from "./HostTagTestIds"
import s from "./Players.module.css"

/** Crown tag marking the host in a player row; the word stays for screen readers. */
export function HostTag() {
  return (
    <span class={s.host} title="Host" data-testid={hostTagTestIds.hostTag}>
      <Icon name="crown" size={12} />
      <span class="sr-only">host</span>
    </span>
  )
}

import { useState } from "preact/hooks"
import type { PlayerName, RoomCode } from "@whereabouts/shared/ids"
import { nameToJoin, savedName } from "../../../settings/settings"
import { Banner } from "../../../ui/Banner/Banner"
import { Icon } from "../../../ui/icons"
import kit from "../../../ui/kit.module.css"
import { joinAsTestIds } from "./JoinAsTestIds"

export function JoinAs({
  code,
  onJoin
}: {
  code: RoomCode | undefined
  onJoin: (name: PlayerName, watch: boolean) => void
}) {
  const [name, setName] = useState(savedName.value)
  const ready = nameToJoin(name)
  return (
    <div class={kit.page} data-testid={joinAsTestIds.page}>
      <form
        class={kit.pageCard}
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) onJoin(ready, false)
        }}
      >
        <Banner />
        <p class={kit.tagline}>
          Joining game <b>{code}</b>
        </p>
        <label class={kit.field}>
          <span>Your name</span>
          <input
            type="text"
            maxLength={20}
            placeholder="Your name"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            autoFocus
            data-testid={joinAsTestIds.nameInput}
          />
        </label>
        <button class="primary big" type="submit" disabled={!ready} data-testid={joinAsTestIds.joinButton}>
          Join
        </button>
        <button class="big" type="button" disabled={!ready} onClick={() => ready && onJoin(ready, true)}>
          <Icon name="eye" /> Just watch
        </button>
        <p class={kit.hint}>
          <a href="#/">Back</a>
        </p>
      </form>
    </div>
  )
}

import { useState } from "preact/hooks"
import type { PlayerName } from "@whereabouts/shared/ids"
import { useGameService } from "../../../game-service/use-game-service"
import { nameToJoin } from "../../../settings/settings"
import { cx } from "../../../ui/cx"
import kit from "../../../ui/kit.module.css"
import { renameFormTestIds } from "./RenameFormTestIds"

export const RenameForm = ({
  current,
  onDone
}: {
  current: string
  onDone: (name: PlayerName | undefined) => void
}) => {
  const game = useGameService()
  const [name, setName] = useState(current)
  return (
    <form
      class={kit.join}
      onSubmit={(event) => {
        event.preventDefault()
        onDone(nameToJoin(name))
      }}
    >
      <input
        class={cx(kit.codeInput, kit.nameInput)}
        type="text"
        maxLength={20}
        value={name}
        onInput={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone(undefined)
        }}
        data-testid={renameFormTestIds.input}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- The player just asked to rename, and the field is all there is.
        autoFocus
      />
      <button
        type="submit"
        data-testid={renameFormTestIds.saveButton}
        disabled={nameToJoin(name) === undefined || !game.online.value}
      >
        Save
      </button>
    </form>
  )
}

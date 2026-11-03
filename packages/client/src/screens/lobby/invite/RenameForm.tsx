import { useState } from "preact/hooks"
import type { PlayerName } from "@whereabouts/shared/ids"
import { nameToJoin } from "../../../settings/settings"
import { cx } from "../../../ui/cx"
import kit from "../../../ui/kit.module.css"
import { renameFormTestIds } from "./RenameFormTestIds"

export const RenameForm = ({
  current,
  online,
  onDone
}: {
  current: string
  online: boolean
  onDone: (name: PlayerName | undefined) => void
}) => {
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
        autoFocus
      />
      <button
        type="submit"
        data-testid={renameFormTestIds.saveButton}
        disabled={nameToJoin(name) === undefined || !online}
      >
        Save
      </button>
    </form>
  )
}

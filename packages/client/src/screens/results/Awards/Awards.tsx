import type { PlayerId } from "@whereabouts/shared/ids"
import type { Award } from "@whereabouts/shared/awards/player-facts"
import { colourCss } from "@whereabouts/shared/colours"
import type { FinalStanding } from "@whereabouts/shared/protocol/views"
import { awardsTestIds } from "./AwardsTestIds"
import styles from "./Awards.module.css"

export const Awards = ({ awards, byId }: { awards: Award[]; byId: ReadonlyMap<PlayerId, FinalStanding> }) => {
  return (
    <section class={styles.awards} aria-label="Awards">
      <h2>Awards</h2>
      <ul>
        {awards.map((award) => (
          <li key={award.title} class={styles.award} data-testid={awardsTestIds.award}>
            <span class={styles.emoji} aria-hidden="true">
              {award.emoji}
            </span>
            <span class={styles.body}>
              <b class={styles.title}>{award.title}</b>
              <span class={styles.line}>
                <AwardLine line={award.line} players={award.playerIds.map((id) => byId.get(id))} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The line with each {n} replaced by that player's name, in their colour. */
const AwardLine = ({ line, players }: { line: string; players: (FinalStanding | undefined)[] }) => {
  return (
    <>
      {line.split(/(\{\d\})/).map((part, i) => {
        const match = /^\{(\d)\}$/.exec(part)
        if (!match) return part
        const player = players[Number(match[1])]
        return (
          <b key={i} style={{ color: player ? colourCss(player.colour) : undefined }}>
            {player?.name ?? "Someone"}
          </b>
        )
      })}
    </>
  )
}

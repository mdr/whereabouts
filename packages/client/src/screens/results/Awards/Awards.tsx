import type { Award } from "@whereabouts/shared/awards/awards"
import { colourCss } from "@whereabouts/shared/colours"
import type { PlayerView } from "@whereabouts/shared/protocol"
import { awardsTestIds } from "./AwardsTestIds"
import s from "./Awards.module.css"

export function Awards({ awards, byId }: { awards: Award[]; byId: Map<string, PlayerView> }) {
  return (
    <section class={s.awards} aria-label="Awards">
      <h2>Awards</h2>
      <ul>
        {awards.map((a) => (
          <li key={a.title} class={s.award} data-testid={awardsTestIds.award}>
            <span class={s.emoji} aria-hidden="true">
              {a.emoji}
            </span>
            <span class={s.body}>
              <b class={s.title}>{a.title}</b>
              <span class={s.line}>
                <AwardLine line={a.line} players={a.playerIds.map((id) => byId.get(id))} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The line with each {n} replaced by that player's name, in their colour. */
function AwardLine({ line, players }: { line: string; players: (PlayerView | undefined)[] }) {
  return (
    <>
      {line.split(/(\{\d\})/).map((part, i) => {
        const m = /^\{(\d)\}$/.exec(part)
        if (!m) return part
        const p = players[Number(m[1])]
        return (
          <b key={i} style={{ color: p ? colourCss(p.colour) : undefined }}>
            {p?.name ?? "Someone"}
          </b>
        )
      })}
    </>
  )
}

import { colourCss, type CssColour, type PlayerColour } from "@whereabouts/shared/colours"
import { cx } from "../cx"
import styles from "./Players.module.css"

export enum SwatchType {
  PLAYER = "PLAYER",
  CSS = "CSS",
  EVERYONE = "EVERYONE"
}

/** A player's colour. */
interface PlayerSwatch {
  type: SwatchType.PLAYER
  colour: PlayerColour
}

/** A colour that is no player's. */
interface CssSwatch {
  type: SwatchType.CSS
  css: CssColour
}

/** All the players' colours. */
interface EveryoneSwatch {
  type: SwatchType.EVERYONE
}

/** A colour dot: a player's, a plain CSS colour, or everyone's. */
export const Swatch = (props: (PlayerSwatch | CssSwatch | EveryoneSwatch) & { as?: "span" | "i"; class?: string }) => {
  const { as: Tag = "span", class: className } = props
  const everyone = props.type === SwatchType.EVERYONE
  const style = everyone
    ? undefined
    : { background: props.type === SwatchType.CSS ? props.css : colourCss(props.colour) }
  return <Tag class={cx(styles.swatch, everyone && styles.everyone, className)} style={style} />
}

import { FactType, type Fact } from "@whereabouts/shared/catalogue/facts"
import { factLineTestIds } from "./FactLineTestIds"
import styles from "./FactLine.module.css"

const FACT_LABELS: Record<FactType, string> = {
  [FactType.FAME]: "Why it's known",
  [FactType.TRIVIA]: "Did you know?",
  [FactType.FLAG]: "About the flag"
}

/** A line of interest about the revealed answer. */
export const FactLine = ({ fact }: { fact: Fact | undefined }) => {
  if (!fact) return undefined
  return (
    <p class={styles.fact} data-testid={factLineTestIds.fact}>
      <span class={styles.factKind}>{FACT_LABELS[fact.type]}</span> {fact.text}
    </p>
  )
}

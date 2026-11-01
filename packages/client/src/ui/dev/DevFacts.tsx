import kit from "../kit.module.css"

/** Small label/value rows for the drawer. */
export function DevFacts({ facts }: { facts: [string, string | number][] }) {
  return (
    <dl class={kit.facts}>
      {facts.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

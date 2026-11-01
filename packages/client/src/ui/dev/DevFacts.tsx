import kit from "../kit.module.css"

/** Small label/value rows for the drawer. */
export const DevFacts = ({ facts }: { facts: [string, string | number][] }) => (
  <dl class={kit.facts}>
    {facts.map(([label, value]) => (
      <div key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ))}
  </dl>
)

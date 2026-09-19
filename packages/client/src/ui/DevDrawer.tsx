/**
 * Right-hand drawer with playtest information and cheats. Renders nothing
 * unless dev mode is on, so screens can include it unconditionally.
 */
import type { ComponentChildren } from "preact";
import { devMode } from "../dev";

export function DevDrawer({ children }: { children?: ComponentChildren }) {
  if (!devMode.value) return null;
  return (
    <aside id="dev" data-testid="dev-drawer">
      <div class="dev-head">
        <span class="badge">DEV</span>
        <span class="hint">Playtest tools. Add ?dev to the URL to get here.</span>
        <button class="small" onClick={() => (devMode.value = false)}>
          Hide
        </button>
      </div>
      {children}
    </aside>
  );
}

/** Small label/value rows for the drawer. */
export function DevFacts({ facts }: { facts: [string, string | number][] }) {
  return (
    <dl class="facts">
      {facts.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

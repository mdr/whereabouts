/**
 * The keyboard shortcuts, listed in a card over the map. `?` opens and closes
 * it, as does the keyboard button in the paint toolbar; Escape or a click
 * outside closes it. The keys themselves are handled where they act
 * (PaintController, the practice screen); this only lists them.
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { createPortal } from "preact/compat";
import { Icon } from "./icons";
import { isTyping } from "../keys";

export const shortcutsOpen = signal(false);

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

/** An action, its key combinations, and whether those are one per action ("/") or alternatives ("or"). */
type Row = { action: string; combos: string[][]; sep?: "/" | "or" };

function rows(practice: boolean): Row[] {
  return [
    { action: "Pan / Paint / Erase", combos: [["1"], ["2"], ["3"]], sep: "/" },
    { action: "Pan while painting", combos: [["Space"]] },
    { action: "Brush smaller / larger", combos: [["["], ["]"]], sep: "/" },
    { action: "Undo", combos: [[MOD, "Z"]] },
    {
      action: "Redo",
      combos: isMac
        ? [[MOD, "⇧", "Z"]]
        : [
            [MOD, "Shift", "Z"],
            ["Ctrl", "Y"],
          ],
      sep: "or",
    },
    ...(practice ? [{ action: "Submit / next question", combos: [["Enter"]] }] : []),
    { action: "Enlarged photo back", combos: [["Esc"]] },
    { action: "These shortcuts", combos: [["?"]] },
  ];
}

/** Toolbar button that opens the card; hidden where there is no keyboard (see CSS). */
export function ShortcutsButton() {
  return (
    <button
      class="icon-only shortcuts-button"
      title="Keyboard shortcuts (?)"
      aria-label="Keyboard shortcuts"
      aria-expanded={shortcutsOpen.value}
      onClick={() => (shortcutsOpen.value = !shortcutsOpen.value)}
    >
      <Icon name="keyboard" />
    </button>
  );
}

/** The card itself, plus the `?` and Escape keys. Mount once per painting screen. */
export function Shortcuts({ practice = false }: { practice?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        shortcutsOpen.value = !shortcutsOpen.value;
        e.preventDefault();
      } else if (e.key === "Escape" && shortcutsOpen.value) {
        shortcutsOpen.value = false;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      shortcutsOpen.value = false;
    };
  }, []);
  if (!shortcutsOpen.value) return null;
  // Into <body>, like the confirm dialog: the toolbar's transform would
  // otherwise trap a fixed card.
  return createPortal(
    <div class="shortcuts-backdrop" onClick={() => (shortcutsOpen.value = false)}>
      <section
        class="card shortcuts"
        role="dialog"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button class="icon" aria-label="Close" title="Close (Esc)" onClick={() => (shortcutsOpen.value = false)}>
            ×
          </button>
        </header>
        <dl>
          {rows(practice).map(({ action, combos, sep }) => (
            <div key={action}>
              <dt>{action}</dt>
              <dd>
                {combos.map((combo, i) => (
                  <span key={i} class="combo">
                    {i > 0 && <span class="sep">{sep}</span>}
                    {combo.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>,
    document.body,
  );
}

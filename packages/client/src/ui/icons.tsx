/** Button icons from Lucide, behind one component so screens name them by role. */
import {
  ArrowRight,
  Check,
  Eraser,
  Flag,
  Hand,
  Info,
  Link,
  Lock,
  Paintbrush,
  Play,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  type LucideProps,
} from "lucide-preact";
import type { FunctionComponent } from "preact";

const ICONS = {
  hand: Hand,
  brush: Paintbrush,
  eraser: Eraser,
  trash: Trash2,
  lock: Lock,
  check: Check,
  info: Info,
  next: ArrowRight,
  flag: Flag,
  link: Link,
  play: Play,
  refresh: RotateCcw,
  undo: Undo2,
  redo: Redo2,
} satisfies Record<string, FunctionComponent<LucideProps>>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const Glyph = ICONS[name];
  return <Glyph class="icon" size={size} strokeWidth={2} aria-hidden="true" />;
}

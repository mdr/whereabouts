/** Button icons from Lucide, behind one component so screens name them by role. */
import {
  ArrowLeft,
  Lightbulb,
  ArrowRight,
  Check,
  ChevronDown,
  CircleStop,
  UserX,
  ChevronUp,
  Crown,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  Hand,
  Info,
  Keyboard,
  Link,
  MapPin,
  Mountain,
  Maximize2,
  PaintBucket,
  Minus,
  Paintbrush,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Share2,
  Trash2,
  Undo2,
  Users,
  Volume2,
  VolumeX,
  Waves,
  createLucideIcon,
  type LucideProps
} from "lucide-preact"
import type { FunctionComponent } from "preact"

// A globe with the band each hint shades on the map: across it, or up and down it.
const LatitudeBand = createLucideIcon("latitude-band", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "globe" }],
  [
    "path",
    {
      d: "M2.46 9h19.08a10 10 0 0 1 0 6H2.46a10 10 0 0 1 0-6z",
      fill: "currentColor",
      "fill-opacity": "0.35",
      stroke: "none",
      key: "band"
    }
  ],
  ["path", { d: "M2.46 9h19.08M2.46 15h19.08", key: "edges" }]
])
const LongitudeBand = createLucideIcon("longitude-band", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "globe" }],
  [
    "path",
    {
      d: "M9 2.46v19.08a10 10 0 0 0 6 0V2.46a10 10 0 0 0-6 0z",
      fill: "currentColor",
      "fill-opacity": "0.35",
      stroke: "none",
      key: "band"
    }
  ],
  ["path", { d: "M9 2.46v19.08M15 2.46v19.08", key: "edges" }]
])

const ICONS = {
  hand: Hand,
  brush: Paintbrush,
  eraser: Eraser,
  trash: Trash2,
  check: Check,
  info: Info,
  keyboard: Keyboard,
  next: ArrowRight,
  back: ArrowLeft,
  flag: Flag,
  pin: MapPin,
  enlarge: Maximize2,
  bucket: PaintBucket,
  link: Link,
  external: ExternalLink,
  play: Play,
  refresh: RotateCcw,
  undo: Undo2,
  edit: Pencil,
  redo: Redo2,
  crown: Crown,
  kick: UserX,
  stop: CircleStop,
  users: Users,
  eye: Eye,
  eyeOff: EyeOff,
  expand: ChevronDown,
  collapse: ChevronUp,
  minus: Minus,
  plus: Plus,
  share: Share2,
  soundOn: Volume2,
  soundOff: VolumeX,
  sea: Waves,
  land: Mountain,
  hint: Lightbulb,
  latitude: LatitudeBand,
  longitude: LongitudeBand
} satisfies Record<string, FunctionComponent<LucideProps>>

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const Glyph = ICONS[name]
  return <Glyph class="icon" size={size} strokeWidth={2} aria-hidden="true" />
}

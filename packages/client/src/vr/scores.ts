/** The score table, to the right of the globe: a round's scores, or the final standings. */
import {
  Group,
  PanelDocument,
  PanelUI,
  RayInteractable,
  Vector3,
  type Entity,
  type UIKitDocument,
  type World
} from "@iwsdk/core"
import scoresUrl from "./scores.uikitml?url"

interface VrTableRow {
  /** A player's colour, for their swatch. */
  colour?: string
  name: string
  /** What happened this round: "+455", "passed". */
  detail?: string
  total: string
  /** On the reveal: pointing at the row shows just this paint, or everyone's, or none. */
  select?: () => void
  selected?: boolean
}

export interface VrTable {
  title: string
  rows: VrTableRow[]
  hint?: string
}

/**
 * As many rows as the panel has: every player, and Everyone and Hide paint
 * on the reveal. scores.uikitml lays them out. Its spans start with text:
 * an empty one has none for setProperties to change.
 */
const TABLE_ROWS = 18
export const SCORES_M = 0.34

export class ScoreBoard {
  private readonly entity: Entity
  private doc: UIKitDocument | undefined = undefined
  private table: VrTable | undefined = undefined
  private readonly clicked: () => void

  constructor(world: World, clicked: () => void) {
    this.clicked = clicked
    this.entity = world.createTransformEntity(new Group(), { persistent: true })
    this.entity.addComponent(RayInteractable)
    this.entity.addComponent(PanelUI, { config: scoresUrl })
    this.entity.object3D!.visible = false
  }

  get object3D() {
    return this.entity.object3D!
  }

  get shown(): VrTable | undefined {
    return this.table
  }

  /** To the right of the globe, turned to face the player. */
  place(head: Vector3, forward: Vector3): void {
    const obj = this.entity.object3D!
    const level = new Vector3(forward.x, 0, forward.z).normalize()
    const right = new Vector3(-level.z, 0, level.x)
    obj.position
      .copy(head)
      .addScaledVector(level, 0.55)
      .addScaledVector(right, 0.5)
      .add(new Vector3(0, -0.1, 0))
    obj.lookAt(head)
  }

  rowAt(i: number): [number, number, number] {
    const p = this.doc!.requireElementById(`row${i}`).getWorldPosition(new Vector3())
    return [p.x, p.y, p.z]
  }

  show(table: VrTable | undefined): void {
    this.table = table
    this.apply()
  }

  /** The panel loads on its own time; fill it once it has. */
  update(): void {
    if (this.doc || !this.entity.hasComponent(PanelDocument)) return
    this.doc = PanelDocument.data.document[this.entity.index] as UIKitDocument
    this.doc.setTargetDimensions(SCORES_M, SCORES_M * 1.6)
    for (let i = 0; i < TABLE_ROWS; i++)
      this.doc.requireElementById(`row${i}`).addEventListener("click", () => {
        const select = this.table?.rows[i]?.select
        if (!select) return
        this.clicked()
        select()
      })
    this.apply()
  }

  private apply(): void {
    const table = this.table
    this.entity.object3D!.visible = table !== undefined
    const doc = this.doc
    if (!doc || !table) return
    const set = (id: string, props: Record<string, unknown>) => doc.getElementById(id)?.setProperties(props)
    set("title", { text: table.title })
    const shown = table.rows.slice(0, TABLE_ROWS)
    for (let i = 0; i < TABLE_ROWS; i++) {
      const row = shown[i]
      set(`row${i}`, { display: row ? "flex" : "none", backgroundColor: row?.selected ? "#ffffff24" : "#00000000" })
      if (!row) continue
      set(`swatch${i}`, { backgroundColor: row.colour ?? "#00000000", display: row.colour ? "flex" : "none" })
      set(`name${i}`, { text: row.name })
      set(`detail${i}`, { text: row.detail ?? "" })
      set(`total${i}`, { text: row.total })
    }
    const more = table.rows.length - shown.length
    set("more", { text: more > 0 ? `and ${more} more` : "", display: more > 0 ? "flex" : "none" })
    set("hint", { text: table.hint ?? "-", display: table.hint ? "flex" : "none" })
  }
}

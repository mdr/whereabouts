/**
 * The end of a game, as the results page shows it: the awards, then every
 * round's scores. Drawn on a canvas rather than a panel, for the awards'
 * emoji, which the panels' font lacks.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from "three"

export interface VrBoard {
  awards: { emoji: string; title: string; line: { text: string; colour?: string }[] }[]
  /** In finishing order, as the rounds' scores are. */
  players: { name: string; colour: string }[]
  rounds: { label: string; scores: (number | undefined)[] }[]
}

const W = 1400
const PAD = 64
const BOARD_M = 0.95
const MAX_H_M = 0.75
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const EMOJI = "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"

export class ResultsBoard {
  readonly mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ transparent: true }))
  private shownBoard: VrBoard | undefined = undefined

  constructor() {
    this.mesh.visible = false
  }

  get shown(): VrBoard | undefined {
    return this.shownBoard
  }

  /** Above and beyond the globe, facing the player. */
  place(head: Vector3, forward: Vector3): void {
    const level = new Vector3(forward.x, 0, forward.z).normalize()
    this.mesh.position
      .copy(head)
      .addScaledVector(level, 1.0)
      .add(new Vector3(0, 0.12, 0))
    this.mesh.lookAt(head)
  }

  show(board: VrBoard | undefined): void {
    if (JSON.stringify(board) === JSON.stringify(this.shownBoard)) return
    this.shownBoard = board
    this.mesh.visible = board !== undefined
    if (!board) return
    const canvas = draw(board)
    // A new texture each time: one already on the GPU keeps its first size.
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    this.mesh.material.map?.dispose()
    this.mesh.material.map = texture
    this.mesh.material.needsUpdate = true
    const aspect = canvas.height / canvas.width
    const width = Math.min(BOARD_M, MAX_H_M / aspect)
    this.mesh.scale.set(width, width * aspect, 1)
  }
}

function draw(board: VrBoard): HTMLCanvasElement {
  const awardRows = Math.ceil(board.awards.length / 2)
  const height =
    PAD * 2 +
    (board.awards.length > 0 ? 90 + awardRows * 150 + 40 : 0) +
    (board.rounds.length > 0 ? 170 + board.rounds.length * 64 : 0)
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas
  ctx.fillStyle = "rgba(17, 24, 33, 0.92)"
  ctx.beginPath()
  ctx.roundRect(0, 0, W, height, 48)
  ctx.fill()
  ctx.textBaseline = "middle"
  let y = PAD

  const heading = (text: string) => {
    ctx.fillStyle = "#94a3b8"
    ctx.font = `700 40px ${FONT}`
    ctx.fillText(text, PAD, y + 30)
    y += 90
  }

  if (board.awards.length > 0) {
    heading("AWARDS")
    const colW = (W - PAD * 2) / 2
    board.awards.forEach((a, i) => {
      const x = PAD + (i % 2) * colW
      const top = y + Math.floor(i / 2) * 150
      ctx.font = `88px ${EMOJI}`
      ctx.fillText(a.emoji, x, top + 60)
      ctx.fillStyle = "#f0fdff"
      ctx.font = `700 46px ${FONT}`
      ctx.fillText(a.title, x + 120, top + 30, colW - 150)
      ctx.font = `36px ${FONT}`
      let lx = x + 120
      for (const part of a.line) {
        ctx.fillStyle = part.colour ?? "#cfd8e3"
        ctx.font = `${part.colour ? "700 " : ""}36px ${FONT}`
        const room = x + colW - 30 - lx
        if (room <= 0) break
        ctx.fillText(part.text, lx, top + 90, room)
        lx += Math.min(room, ctx.measureText(part.text).width)
      }
    })
    y += awardRows * 150 + 40
  }

  if (board.rounds.length > 0) {
    heading("ROUNDS")
    const labelW = 560
    const colW = Math.min(180, (W - PAD * 2 - labelW) / Math.max(1, board.players.length))
    const colX = (j: number) => PAD + labelW + j * colW + colW / 2
    ctx.textAlign = "center"
    board.players.forEach((p, j) => {
      ctx.fillStyle = p.colour
      ctx.beginPath()
      ctx.arc(colX(j), y + 10, 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#cfd8e3"
      ctx.font = `30px ${FONT}`
      ctx.fillText(p.name, colX(j), y + 52, colW - 12)
    })
    y += 80
    board.rounds.forEach((r, i) => {
      const rowY = y + i * 64 + 32
      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.04)"
        ctx.fillRect(PAD - 16, rowY - 32, W - PAD * 2 + 32, 64)
      }
      ctx.textAlign = "left"
      ctx.fillStyle = "#cfd8e3"
      ctx.font = `36px ${FONT}`
      ctx.fillText(`${i + 1}. ${r.label}`, PAD, rowY, labelW - 30)
      const best = Math.max(-1, ...r.scores.map((s) => s ?? -1))
      ctx.textAlign = "center"
      r.scores.forEach((s, j) => {
        const top = s !== undefined && s === best
        ctx.fillStyle = top ? "#67e8f9" : "#f0fdff"
        ctx.font = `${top ? "700 " : ""}38px ${FONT}`
        ctx.fillText(s === undefined ? "–" : String(Math.round(s)), colX(j), rowY)
      })
    })
    ctx.textAlign = "left"
  }
  return canvas
}

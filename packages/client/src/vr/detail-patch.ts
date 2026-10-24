/**
 * The page's map, laid over the part of a zoomed-in globe that faces the
 * player, for detail the globe's own picture lacks. A hidden copy of the
 * map draws it. The headset runs none of the page's animation frames, which
 * MapLibre draws on, so it is drawn here on demand with map.redraw().
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, Mesh, MeshBasicMaterial, SRGBColorSpace } from "three"
import { greatCircleDistance, type LatLon, type MapDetail } from "@whereabouts/shared"
import { GameMap } from "../map"
import type { Theme } from "../themes"
import { latLonToLocal } from "./sphere"

const SIZE = 1024
const PIXEL_RATIO = 2
const GRID = 48
/** The outer part of the patch, as a fraction of its width, fades into the globe below. */
const FADE = 0.12
/** How often to look for the map having finished, while it waits for tiles. */
const POLL_S = 0.25
const EARTH_M = 40_075_016.686
const RAD = Math.PI / 180

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))
const mercLat = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD

export class DetailPatch {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>
  private readonly gameMap: GameMap
  private readonly texture: CanvasTexture
  private readonly radius: number
  private ready = false
  /** The view asked of the map, whether or not it has finished drawing it. */
  private asked: { centre: LatLon; halfKm: number } | undefined = undefined
  /** Whether the globe shows the map's latest picture. */
  private shown = true
  private lastPoll = 0

  constructor(theme: Theme, radius: number, anisotropy: number) {
    this.radius = radius
    const host = document.createElement("div")
    host.style.cssText = `position:fixed;left:0;top:0;width:${SIZE}px;height:${SIZE}px;visibility:hidden;pointer-events:none`
    document.body.append(host)
    this.gameMap = new GameMap(host, {
      pixelRatio: PIXEL_RATIO,
      interactive: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true }
    })
    void this.gameMap.ready.then(() => {
      this.gameMap.applyTheme(theme)
      this.ready = true
    })
    this.texture = new CanvasTexture(this.gameMap.map.getCanvas())
    this.texture.colorSpace = SRGBColorSpace
    this.texture.anisotropy = anisotropy
    this.mesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({ map: this.texture, vertexColors: true, transparent: true, depthWrite: false })
    )
    this.mesh.visible = false
  }

  /** As the page's map shows it while painting, but always with national borders, as the globe has. */
  setDetail(detail: MapDetail): void {
    void this.gameMap.ready.then(() => {
      this.gameMap.setDetail(detail)
      this.gameMap.setBorders(true, false)
      this.shown = false
    })
  }

  /** `halfKm`: how far either side of `centre` to show; undefined hides the patch. */
  update(now: number, centre: LatLon, halfKm: number | undefined): void {
    const map = this.gameMap.map
    if (now - this.lastPoll < POLL_S) return
    this.lastPoll = now
    // Without animation frames the map would never draw the frame that finishes its loading.
    if (!this.ready) {
      map.redraw()
      return
    }
    if (halfKm === undefined) {
      this.mesh.visible = false
      this.asked = undefined
      return
    }
    const moved =
      !this.asked ||
      greatCircleDistance(centre, this.asked.centre) > 0.2 * this.asked.halfKm ||
      Math.abs(Math.log(halfKm / this.asked.halfKm)) > 0.2
    if (moved) {
      const lat = Math.max(-80, Math.min(80, centre.lat))
      const zoom = Math.log2((EARTH_M * Math.cos(lat * RAD) * SIZE) / (512 * 2 * halfKm * 1000))
      map.jumpTo({ center: [centre.lon, lat], zoom: Math.max(1, Math.min(15, zoom)) })
      this.asked = { centre, halfKm }
      this.shown = false
    }
    if (this.shown) return
    // Drawing works out which tiles the view needs and asks for them; once
    // they have all come, the picture is whole and the globe takes it.
    map.redraw()
    // Not map.loaded(): the hidden relief source never counts as loaded.
    if (!map.areTilesLoaded()) return
    this.texture.needsUpdate = true
    this.mesh.geometry.dispose()
    this.mesh.geometry = this.patch()
    this.mesh.visible = true
    this.shown = true
  }

  /** The sphere under the map's view, its texture laid as Mercator lays it. */
  private patch(): BufferGeometry {
    const b = this.gameMap.map.getBounds()
    const [south, north] = [mercY(b.getSouth()), mercY(b.getNorth())]
    const position = new Float32Array((GRID + 1) ** 2 * 3)
    const uv = new Float32Array((GRID + 1) ** 2 * 2)
    const colour = new Float32Array((GRID + 1) ** 2 * 4)
    const index: number[] = []
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        const [u, v] = [i / GRID, j / GRID]
        const k = j * (GRID + 1) + i
        const at = { lat: mercLat(south + (north - south) * v), lon: b.getWest() + (b.getEast() - b.getWest()) * u }
        latLonToLocal(at)
          .multiplyScalar(this.radius)
          .toArray(position, k * 3)
        uv.set([u, v], k * 2)
        colour.set([1, 1, 1, Math.min(1, Math.min(u, 1 - u, v, 1 - v) / FADE)], k * 4)
        if (i < GRID && j < GRID) index.push(k, k + 1, k + GRID + 1, k + 1, k + GRID + 2, k + GRID + 1)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute("position", new BufferAttribute(position, 3))
    g.setAttribute("uv", new BufferAttribute(uv, 2))
    g.setAttribute("color", new BufferAttribute(colour, 4))
    g.setIndex(index)
    return g
  }
}

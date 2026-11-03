// Builds offline-world/: everything the map fetches from outside, at the
// coarsest zooms, so isolated browser tests (*.iwft.ts) run with no network.
// MapLibre overzooms the coarse tiles. Run again to refresh it.
//
// Usage: node scripts/build-offline-world.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { deflateSync } from "node:zlib"

/** Vector tiles at zoom 2 are 14 MB; zoom 1 still shows every country and coast. */
const VECTOR_MAXZOOM = 1
/** The VR globe draws from the zoom 2 relief tiles. */
const RELIEF_MAXZOOM = 2
const HOST = "https://tiles.openfreemap.org"
const OUT = new URL("../browser/offline/offline-world/", import.meta.url).pathname
/** The headset emulator's controllers, which the WebXR input library loads from a CDN. */
const CONTROLLER_MODELS =
  "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/meta-quest-touch-plus"
/** Latin script only: labels in other scripts don't draw. */
const GLYPH_RANGES = ["0-255"]

const fetchOk = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}
const write = (path, data) => {
  const file = join(OUT, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
  return data.length
}
const tilesUpTo = (maxzoom) =>
  Array.from({ length: maxzoom + 1 }, (_, z) =>
    Array.from({ length: 4 ** z }, (_, i) => ({ z, x: i % 2 ** z, y: Math.floor(i / 2 ** z) }))
  ).flat()

/** A PNG of one colour, for the flat terrain and the photo stand-in. */
const solidPng = (size, [r, g, b]) => {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (data) => {
    let c = 0xffffffff
    for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([length, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])
  const pixels = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0))
  ])
}

rmSync(OUT, { recursive: true, force: true })
const sizes = {}
const add = (kind, bytes) => (sizes[kind] = (sizes[kind] ?? 0) + bytes)

const style = JSON.parse(await fetchOk(`${HOST}/styles/positron`))
style.sources.ne2_shaded.maxzoom = RELIEF_MAXZOOM
add("style", write("style.json", JSON.stringify(style)))

const planet = JSON.parse(await fetchOk(style.sources.openmaptiles.url))
const vectorTiles = planet.tiles[0]
planet.tiles = [`${HOST}/planet/offline/{z}/{x}/{y}.pbf`]
planet.maxzoom = VECTOR_MAXZOOM
add("style", write("planet.json", JSON.stringify(planet)))

const at = (pattern, { z, x, y }) => pattern.replace("{z}", z).replace("{x}", x).replace("{y}", y)
for (const tile of tilesUpTo(VECTOR_MAXZOOM))
  add("vector tiles", write(at("planet/{z}/{x}/{y}.pbf", tile), await fetchOk(at(vectorTiles, tile))))
for (const tile of tilesUpTo(RELIEF_MAXZOOM))
  add(
    "relief tiles",
    write(at("ne2sr/{z}/{x}/{y}.png", tile), await fetchOk(at(style.sources.ne2_shaded.tiles[0], tile)))
  )

for (const suffix of [".json", ".png", "@2x.json", "@2x.png"])
  add("sprites", write(`sprites/ofm${suffix}`, await fetchOk(`${style.sprite}${suffix}`)))

const fontStacks = new Set(
  style.layers.flatMap((layer) => {
    const font = layer.layout?.["text-font"]
    return Array.isArray(font) && font.every((name) => typeof name === "string") ? [font.join(",")] : []
  })
)
for (const stack of fontStacks)
  for (const range of GLYPH_RANGES) {
    const url = style.glyphs.replace("{fontstack}", encodeURIComponent(stack)).replace("{range}", range)
    add("fonts", write(`fonts/${stack}/${range}.pbf`, await fetchOk(url)))
  }

for (const hand of ["left", "right"])
  add("controllers", write(`controllers/${hand}.glb`, await fetchOk(`${CONTROLLER_MODELS}/${hand}.glb`)))

// Terrarium encodes height as (R × 256 + G + B / 256) − 32768: this is sea level everywhere.
add("stand-ins", write("flat-terrain.png", solidPng(256, [128, 0, 0])))
add("stand-ins", write("photo.png", solidPng(64, [120, 128, 140])))

for (const [kind, bytes] of Object.entries(sizes)) console.log(kind.padEnd(14), `${Math.round(bytes / 1024)} KB`)
console.log("font stacks:", [...fontStacks].join(" | "))

// Every flag country's flag in one picture, for the reveal's "Show all
// flags": drawing 194 SVGs as they are needed stalls a headset for seconds.
// Draws them in headless Chrome into src/assets/flag-atlas.webp, each in its
// own shape at the left of its cell, and their order and drawn widths into
// src/flag-atlas.json. Rerun after scripts/build-flags.mjs.
// Usage, from packages/client: node scripts/build-flag-atlas.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { chromium } from "playwright-core"

const COLUMNS = 8
// Wide enough for the widest flag, Qatar's, at this height.
const CELL = [128, 48]

const flags = JSON.parse(readFileSync("src/assets/flags/flags.json", "utf8"))
const codes = JSON.parse(readFileSync("../shared/flags.json", "utf8"))
  .map((f) => f.flag)
  .sort()
const widths = codes.map((c) => Math.min(CELL[0], Math.round(CELL[1] * flags[c].ratio)))
const svgs = codes.map((c) => readFileSync(`src/assets/flags/${c}.svg`, "utf8"))

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage()
const webp = await page.evaluate(
  async ({ svgs, widths, columns, cell }) => {
    const [w, h] = cell
    const canvas = document.createElement("canvas")
    canvas.width = columns * w
    canvas.height = Math.ceil(svgs.length / columns) * h
    const ctx = canvas.getContext("2d")
    for (const [i, svg] of svgs.entries()) {
      const img = new Image()
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      await img.decode()
      ctx.drawImage(img, (i % columns) * w, Math.floor(i / columns) * h, widths[i], h)
    }
    return canvas.toDataURL("image/webp", 0.92)
  },
  { svgs, widths, columns: COLUMNS, cell: CELL }
)
await browser.close()

writeFileSync("src/assets/flag-atlas.webp", Buffer.from(webp.split(",")[1], "base64"))
writeFileSync("src/flag-atlas.json", `${JSON.stringify({ columns: COLUMNS, cell: CELL, codes, widths })}\n`)
console.log(`${codes.length} flags`)

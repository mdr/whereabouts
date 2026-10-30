// Builds the flag pictures, src/assets/flags/<code>.svg, from the image on
// each flag's English Wikipedia article (an SVG on Wikimedia Commons), at the
// flag's own proportions, and src/assets/flags/flags.json: each flag's
// width / height, and its Commons file and licence, for credit and updating.
//
// Each SVG is shrunk with svgo, rounding coordinates relative to its own size,
// then drawn beside the original in headless Chrome: if they differ, it tries
// finer rounding, and in the end keeps the original drawing.
//
// Usage, from packages/client: node scripts/build-flags.mjs [cache dir]
// With a cache dir, downloads are kept there and reused.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { optimize } from "svgo"
import { chromium } from "playwright-core"

const OUT = "src/assets/flags"
const USER_AGENT = "WhereaboutsFlagBuilder/1.0 (https://github.com/mdr/whereabouts)"
// Rounded to about 1/4000 of the flag's width.
const DETAIL = 4000
const CHECK_WIDTH = 800
// A pixel differs when its RGB channels differ by more than this in total,
const PIXEL_TOLERANCE = 60
// ...and a flag differs when more than this share of its pixels do.
const MAX_DIFFERING = 0.001
const EXTRA_PRECISION = 3

const cacheDir = process.argv[2]
const flags = JSON.parse(readFileSync("../shared/flags.json", "utf8"))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
    if (res.ok) return res
    if (attempt === 4) throw new Error(`${res.status} for ${url}`)
    await sleep(Number(res.headers.get("retry-after")) * 1000 || 2000 * attempt)
  }
}

async function api(host, params) {
  const query = new URLSearchParams({ ...params, format: "json", formatversion: "2" })
  return (await get(`https://${host}/w/api.php?${query}`)).json()
}

/** Each article's main image, by article title. */
async function articleImages(titles) {
  const images = new Map()
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const { query } = await api("en.wikipedia.org", {
      action: "query",
      prop: "pageimages",
      piprop: "name",
      redirects: "1",
      titles: batch.join("|")
    })
    const asked = new Map()
    for (const { from, to } of [...(query.normalized ?? []), ...(query.redirects ?? [])]) {
      asked.set(to, asked.get(from) ?? from)
    }
    for (const page of query.pages) images.set(asked.get(page.title) ?? page.title, page.pageimage)
  }
  return images
}

/** Each Commons file's URL and licence, by file name. */
async function fileInfo(names) {
  const info = new Map()
  for (let i = 0; i < names.length; i += 50) {
    const { query } = await api("commons.wikimedia.org", {
      action: "query",
      prop: "imageinfo",
      iiprop: "size|extmetadata|url",
      iiextmetadatafilter: "LicenseShortName",
      titles: names
        .slice(i, i + 50)
        .map((n) => `File:${n}`)
        .join("|")
    })
    for (const page of query.pages) {
      const [ii] = page.imageinfo
      info.set(page.title.replace(/^File:/, "").replaceAll(" ", "_"), {
        url: ii.url.replace(/\?.*/, ""),
        licence: ii.extmetadata.LicenseShortName.value
      })
    }
  }
  return info
}

async function download(code, url) {
  const cached = cacheDir && `${cacheDir}/${code}.svg`
  if (cached && existsSync(cached)) return readFileSync(cached, "utf8")
  await sleep(500)
  const svg = await (await get(url)).text()
  if (cached) writeFileSync(cached, svg)
  return svg
}

/**
 * The SVG with a viewBox the flag's own shape and no fixed size, so it fills
 * whatever box it is drawn in; and that shape's width and height.
 */
function normalise(svg) {
  const root = svg.match(/<svg\b[^>]*>/)[0]
  const attr = (name) => root.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`))?.[1]
  const viewBox = attr("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  const width = parseFloat(attr("width"))
  const height = parseFloat(attr("height"))
  const [x, y, w, h] = viewBox ?? [0, 0, width, height]
  if (!(w > 0 && h > 0)) throw new Error(`no size in ${root}`)
  let tag = root.replace(/\s(width|height|viewBox|preserveAspectRatio)\s*=\s*["'][^"']*["']/g, "")
  let body = svg.slice(svg.indexOf(root) + root.length, svg.lastIndexOf("</svg>"))
  let box = [x, y, w, h]
  // Stretched to its width and height: stretch the drawing to match instead.
  if (viewBox && attr("preserveAspectRatio") === "none" && width > 0 && height > 0) {
    const sy = (w * height) / width / h
    body = `<g transform="translate(0 ${-y * sy}) scale(1 ${sy})">${body}</g>`
    box = [x, 0, w, h * sy]
  }
  tag = tag.replace(/<svg\b/, `<svg viewBox="${box.join(" ")}"`)
  return { svg: `${svg.slice(0, svg.indexOf(root))}${tag}${body}</svg>`, w: box[2], h: box[3] }
}

// A flag's title or description would name the country.
const UNNAMED = ["removeTitle", { name: "removeDesc", params: { removeAny: true } }, "removeMetadata"]

function shrink(svg, precision) {
  return optimize(svg, {
    multipass: true,
    floatPrecision: precision,
    plugins: ["preset-default", "removeDimensions", ...UNNAMED]
  }).data
}

/**
 * The share of pixels that differ between two drawings of a flag, compared
 * at a quarter of the size drawn: a fine line shifted by part of a pixel
 * averages out, a shape that moved does not.
 */
async function differing(page, a, b, ratio) {
  return page.evaluate(
    async ({ a, b, w, h, tolerance }) => {
      const [sw, sh] = [Math.round(w / 4), Math.round(h / 4)]
      const draw = async (svg) => {
        const img = new Image()
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        await img.decode()
        const big = new OffscreenCanvas(w, h)
        big.getContext("2d").drawImage(img, 0, 0, w, h)
        const ctx = new OffscreenCanvas(sw, sh).getContext("2d")
        ctx.imageSmoothingQuality = "high"
        ctx.drawImage(big, 0, 0, sw, sh)
        return ctx.getImageData(0, 0, sw, sh).data
      }
      const [pa, pb] = [await draw(a), await draw(b)]
      let bad = 0
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2])
        if (d > tolerance) bad++
      }
      return bad / (sw * sh)
    },
    { a, b, w: CHECK_WIDTH, h: Math.round(CHECK_WIDTH / ratio), tolerance: PIXEL_TOLERANCE }
  )
}

const images = await articleImages(flags.map((f) => f.wiki))
const info = await fileInfo([...new Set(images.values())].filter(Boolean))
if (cacheDir) mkdirSync(cacheDir, { recursive: true })
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage()
const out = {}
for (const f of [...flags].sort((a, b) => a.flag.localeCompare(b.flag))) {
  const file = images.get(f.wiki)?.replaceAll(" ", "_")
  const source = file && info.get(file)
  if (!source || !file.endsWith(".svg")) throw new Error(`${f.flag}: no SVG for ${f.wiki} (${file})`)
  const raw = await download(f.flag, source.url)
  const { svg, w, h } = normalise(raw)
  const ratio = w / h
  // Drawn against the normalised original: a raw file can lack a viewBox, and so not scale.
  const base = Math.max(0, Math.ceil(Math.log10(DETAIL / w)))
  let result = optimize(svg, { plugins: UNNAMED }).data
  let note = "unoptimised"
  for (let p = base; p <= base + EXTRA_PRECISION; p++) {
    const small = shrink(svg, p)
    const share = await differing(page, svg, small, ratio)
    if (share <= MAX_DIFFERING) {
      result = small
      note = `precision ${p}, ${(share * 100).toFixed(3)}% differ`
      break
    }
    console.log(`${f.flag}: precision ${p} differs at ${(share * 100).toFixed(3)}%`)
  }
  writeFileSync(`${OUT}/${f.flag}.svg`, result)
  out[f.flag] = { ratio: Math.round(ratio * 10000) / 10000, file, licence: source.licence }
  console.log(`${f.flag}: ${file}, ${raw.length} → ${result.length} bytes, ${note}`)
}
await browser.close()

writeFileSync(`${OUT}/flags.json`, `${JSON.stringify(out, null, 2)}\n`)
console.log(`${Object.keys(out).length} flags`)

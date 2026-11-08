// Builds the catalogue's "Parts of countries" questions, with their places
// and outlines, from Natural Earth (public domain). See write-catalogue.ts.
//
// Usage: node --experimental-transform-types scripts/build-parts.ts [dir with the geojson files in FILES]
// Without a directory it downloads them from the Natural Earth repository.
//
// Territories, outlying islands and the UK nations, from the 1:10m map
// units, or admin-1 where Natural Earth keeps the place only as provinces
// of its country. Each is painted whole, like a country (see
// build-regions.ts), with the same rules: smaller than POINT_BELOW_KM2, or
// too scattered to outline, it is asked as a point instead.
import polygonClipping from "polygon-clipping"
import type { LatLon, LonLat, MultiPolygon } from "../src/geo.ts"
import { AnswerType, ClueType, QuestionType, Surface, type PartOf } from "../src/questions.ts"
import { flagCode } from "../src/ids.ts"
import { loadFeatures, type Feature } from "./natural-earth.ts"
import { writeQuestions, type Outlines, type StoredPlace, type StoredQuestion } from "./write-catalogue.ts"
import {
  MIN_KEPT_SHARE,
  POINT_BELOW_KM2,
  areaOf,
  cellsOf,
  centroid,
  crossesAntimeridian,
  distanceKm,
  islandAnswer,
  keptParts,
  onLand,
  pointToleranceKm,
  polygonAreaKm2,
  polygonsOf,
  regionToleranceKm,
  simplified,
  slug
} from "./outline.ts"

const FILES = {
  mapUnits: "ne_10m_admin_0_map_units",
  provinces: "ne_10m_admin_1_states_provinces_lakes"
}

enum SourceType {
  MAP_UNIT = "MAP_UNIT",
  PROVINCES = "PROVINCES",
  ISLAND = "ISLAND"
}

/** A map unit by its GEOUNIT. */
interface MapUnitSource {
  type: SourceType.MAP_UNIT
  geounit: string
}

/** The admin-1 provinces of a country with this region, or this name. */
interface ProvincesSource {
  type: SourceType.PROVINCES
  admin: string
  region?: string
  name?: string
}

/** The island of a province at a point on it. */
interface IslandSource {
  type: SourceType.ISLAND
  admin: string
  name: string
  at: LonLat
}

type Source = MapUnitSource | ProvincesSource | IslandSource

interface Part {
  label: string
  source: Source
  /** In the prompt, where not the label: "the Azores". */
  name?: string
  /** "Where are the Azores?" */
  plural?: boolean
  /** English Wikipedia title, where not the label. */
  wiki?: string
  status: string
  flag: string
}

const mapUnit = (geounit: string): MapUnitSource => ({ type: SourceType.MAP_UNIT, geounit })
const region = (admin: string, name: string): ProvincesSource => ({ type: SourceType.PROVINCES, admin, region: name })
const province = (admin: string, name: string): ProvincesSource => ({ type: SourceType.PROVINCES, admin, name })

const UK_NATION = { status: "a nation of the United Kingdom", flag: "gb" }
const CROWN_DEPENDENCY = { status: "a British Crown dependency", flag: "gb" }
const BRITISH_TERRITORY = { status: "a British overseas territory", flag: "gb" }
const FRENCH_REGION = { status: "an overseas region of France", flag: "fr" }
const US_TERRITORY = { status: "a US territory", flag: "us" }
const DUTCH_COUNTRY = { status: "a country within the Kingdom of the Netherlands", flag: "nl" }
const DANISH = { status: "part of the Kingdom of Denmark", flag: "dk" }
const CHINESE_SAR = { status: "a special administrative region of China", flag: "cn" }
const SPANISH_COMMUNITY = { status: "an autonomous community of Spain", flag: "es" }
const PORTUGUESE_REGION = { status: "an autonomous region of Portugal", flag: "pt" }
const ITALIAN_REGION = { status: "a region of Italy", flag: "it" }

const PARTS: Part[] = [
  { label: "England", source: mapUnit("England"), ...UK_NATION },
  { label: "Scotland", source: mapUnit("Scotland"), ...UK_NATION },
  { label: "Wales", source: mapUnit("Wales"), ...UK_NATION },
  // Whether it is a nation is disputed.
  { label: "Northern Ireland", source: mapUnit("Northern Ireland"), status: "part of the United Kingdom", flag: "gb" },
  { label: "Isle of Man", name: "the Isle of Man", source: mapUnit("Isle of Man"), ...CROWN_DEPENDENCY },
  { label: "Jersey", source: mapUnit("Jersey"), ...CROWN_DEPENDENCY },
  { label: "Guernsey", source: mapUnit("Guernsey"), ...CROWN_DEPENDENCY },
  { label: "Gibraltar", source: mapUnit("Gibraltar"), ...BRITISH_TERRITORY },
  { label: "Bermuda", source: mapUnit("Bermuda"), ...BRITISH_TERRITORY },
  {
    label: "Cayman Islands",
    name: "the Cayman Islands",
    plural: true,
    source: mapUnit("Cayman Islands"),
    ...BRITISH_TERRITORY
  },
  {
    label: "Falkland Islands",
    name: "the Falkland Islands",
    plural: true,
    source: mapUnit("Falkland Islands"),
    status: "a British overseas territory, claimed by Argentina",
    flag: "gb"
  },
  { label: "Greenland", source: mapUnit("Greenland"), ...DANISH },
  { label: "Faroe Islands", name: "the Faroe Islands", plural: true, source: mapUnit("Faroe Islands"), ...DANISH },
  { label: "Svalbard", source: mapUnit("Svalbard"), status: "part of Norway", flag: "no" },
  { label: "French Guiana", source: mapUnit("French Guiana"), ...FRENCH_REGION },
  { label: "Réunion", source: mapUnit("Reunion"), ...FRENCH_REGION },
  { label: "Guadeloupe", source: mapUnit("Guadeloupe"), ...FRENCH_REGION },
  { label: "Martinique", source: mapUnit("Martinique"), ...FRENCH_REGION },
  {
    label: "French Polynesia",
    source: mapUnit("French Polynesia"),
    status: "an overseas collectivity of France",
    flag: "fr"
  },
  { label: "New Caledonia", source: mapUnit("New Caledonia"), status: "a territory of France", flag: "fr" },
  { label: "Corsica", source: region("France", "Corse"), status: "part of France", flag: "fr" },
  { label: "Puerto Rico", source: mapUnit("Puerto Rico"), ...US_TERRITORY },
  { label: "Guam", source: mapUnit("Guam"), ...US_TERRITORY },
  {
    label: "US Virgin Islands",
    name: "the US Virgin Islands",
    plural: true,
    wiki: "United States Virgin Islands",
    source: mapUnit("United States Virgin Islands"),
    ...US_TERRITORY
  },
  { label: "Aruba", source: mapUnit("Aruba"), ...DUTCH_COUNTRY },
  { label: "Curaçao", source: mapUnit("Curaçao"), ...DUTCH_COUNTRY },
  { label: "Hong Kong", source: mapUnit("Hong Kong S.A.R."), ...CHINESE_SAR },
  { label: "Macau", source: mapUnit("Macao S.A.R"), ...CHINESE_SAR },
  {
    label: "Canary Islands",
    name: "the Canary Islands",
    plural: true,
    source: region("Spain", "Canary Is."),
    ...SPANISH_COMMUNITY
  },
  {
    label: "Balearic Islands",
    name: "the Balearic Islands",
    plural: true,
    source: region("Spain", "Islas Baleares"),
    ...SPANISH_COMMUNITY
  },
  { label: "Azores", name: "the Azores", plural: true, source: mapUnit("Azores"), ...PORTUGUESE_REGION },
  { label: "Madeira", source: mapUnit("Madeira"), ...PORTUGUESE_REGION },
  { label: "Sicily", source: region("Italy", "Sicily"), ...ITALIAN_REGION },
  { label: "Sardinia", source: region("Italy", "Sardegna"), ...ITALIAN_REGION },
  { label: "Crete", source: province("Greece", "Kriti"), status: "a region of Greece", flag: "gr" },
  {
    label: "Galápagos Islands",
    name: "the Galápagos Islands",
    plural: true,
    source: province("Ecuador", "Galápagos"),
    status: "a province of Ecuador",
    flag: "ec"
  },
  {
    label: "Easter Island",
    source: { type: SourceType.ISLAND, admin: "Chile", name: "Valparaíso", at: [-109.35, -27.12] },
    status: "part of Chile",
    flag: "cl"
  },
  { label: "Zanzibar", source: mapUnit("Zanzibar"), status: "a semi-autonomous part of Tanzania", flag: "tz" },
  { label: "Tasmania", source: province("Australia", "Tasmania"), status: "a state of Australia", flag: "au" }
]

interface MapUnitProperties {
  GEOUNIT: string
  LABEL_X: number
  LABEL_Y: number
}

interface ProvinceProperties {
  admin: string
  name: string
  region?: string
}

/** The place's land, and the point Natural Earth labels it at, if it has one. */
const landOf = (source: Source): { polygons: MultiPolygon; label?: LatLon } => {
  switch (source.type) {
    case SourceType.MAP_UNIT: {
      const feature = mapUnits.find((candidate) => candidate.properties.GEOUNIT === source.geounit)
      if (!feature) throw new Error(`no map unit ${source.geounit}`)
      const { LABEL_X, LABEL_Y } = feature.properties
      return { polygons: polygonsOf(feature.geometry), label: { lat: LABEL_Y, lon: LABEL_X } }
    }
    case SourceType.PROVINCES: {
      const matching = provinces.filter(
        ({ properties }) =>
          properties.admin === source.admin &&
          (source.region === undefined || properties.region === source.region) &&
          (source.name === undefined || properties.name === source.name)
      )
      if (matching.length === 0) throw new Error(`no provinces of ${source.admin} for ${source.region ?? source.name}`)
      const [first = [], ...rest] = matching.map((feature) => polygonsOf(feature.geometry))
      return { polygons: rest.length > 0 ? polygonClipping.union(first, ...rest) : first }
    }
    case SourceType.ISLAND: {
      const feature = provinces.find(
        ({ properties }) => properties.admin === source.admin && properties.name === source.name
      )
      const polygon = feature && polygonsOf(feature.geometry).find((candidate) => onLand(source.at, [candidate]))
      if (!polygon) throw new Error(`no land of ${source.name} at ${source.at}`)
      return { polygons: [polygon] }
    }
  }
}

const outlines: Outlines = {}
const places: StoredPlace[] = []
const out: StoredQuestion[] = []

const build = ({ label, source, name = label, plural = false, wiki = label, status, flag }: Part): void => {
  const id = `part-${slug(label)}`
  const partOf: PartOf = { status, flag: flagCode(flag) }
  const { polygons, label: labelPoint } = landOf(source)
  const area = polygons.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0)
  const kept = area >= POINT_BELOW_KM2 ? keptParts({ type: "MultiPolygon", coordinates: polygons }) : []
  const keptShare = kept.length > 0 ? kept.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0) / area : 0
  if (kept.length > 0 && keptShare >= MIN_KEPT_SHARE && !crossesAntimeridian(kept)) {
    const cells = kept.flatMap((polygon) => cellsOf(polygon, 6))
    const paintedArea = areaOf(cells)
    const tolerance = regionToleranceKm(paintedArea)
    outlines[id] = simplified(kept)
    places.push({
      id,
      label,
      wiki,
      partOf,
      area: { outline: id, centre: centroid(cells), tolerance, surface: Surface.LAND }
    })
    out.push({
      id,
      type: QuestionType.PART_OF_COUNTRY,
      place: id,
      clue: { type: ClueType.NAME, prompt: `Paint the whole of ${name}` },
      answer: { type: AnswerType.AREA }
    })
    console.log(`${label}: painted, ${kept.length} part(s), ${Math.round(paintedArea)} km², tolerance ${tolerance} km`)
    return
  }
  const middle = labelPoint ?? centroid(polygons.flatMap((polygon) => cellsOf(polygon, 9)))
  const at = islandAnswer({ LABEL_X: middle.lon, LABEL_Y: middle.lat }, polygons)
  const spread = Math.max(
    ...polygons.flatMap((polygon) => polygon[0]!.map((point) => distanceKm([at.lon, at.lat], point)))
  )
  const tolerance = pointToleranceKm(area, spread, polygons.length > 1)
  places.push({ id, label, wiki, partOf, at })
  out.push({
    id,
    type: QuestionType.PART_OF_COUNTRY,
    place: id,
    clue: { type: ClueType.NAME, prompt: `Where ${plural ? "are" : "is"} ${name}?` },
    answer: { type: AnswerType.POINT, tolerance }
  })
  console.log(`${label}: point, ${polygons.length} part(s), ${Math.round(area)} km², tolerance ${tolerance} km`)
}

const mapUnits: Feature<MapUnitProperties>[] = await loadFeatures(FILES.mapUnits, process.argv[2])
const provinces: Feature<ProvinceProperties>[] = await loadFeatures(FILES.provinces, process.argv[2])
for (const part of PARTS) build(part)

writeQuestions([QuestionType.PART_OF_COUNTRY], out, places, outlines)

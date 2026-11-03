import { CATALOGUE } from "@whereabouts/shared/catalogue/catalogue"
import { placeId, questionId, wikiTitle } from "@whereabouts/shared/ids"
import { mixOf, type GameConfig } from "@whereabouts/shared/protocol/config"
import { AnswerType, ClueType, QuestionType, type PlaceQuestion, type Question } from "@whereabouts/shared/questions"

const place = (id: string, label: string, lat: number, lon: number, tolerance: number): PlaceQuestion => ({
  type: QuestionType.PLACE,
  id: questionId(id),
  place: placeId(id),
  label,
  wiki: wikiTitle(label),
  clue: { type: ClueType.NAME, prompt: `Where is ${label}?` },
  answer: { type: AnswerType.POINT, at: { lat, lon }, tolerance }
})

/** Two known place names, and the real questions of the other types. */
export const TEST_CATALOGUE: Question[] = [
  place("petra", "Petra", 30.3285, 35.4444, 200),
  place("paris", "Paris", 48.8566, 2.3522, 100),
  ...CATALOGUE.filter((question) => question.type !== QuestionType.PLACE)
]

export const TEST_CONFIG: Partial<GameConfig> = { mix: mixOf({ [QuestionType.PLACE]: 2 }), roundLength: 60_000 }

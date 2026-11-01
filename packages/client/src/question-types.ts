/** How each type of question is named and coloured, wherever the client shows one. */
import type { CssColour } from "@whereabouts/shared/colours"
import { QuestionType } from "@whereabouts/shared/questions"

interface QuestionTypeLook {
  label: string
  /** Under the label in the mix editor and practice's choice. */
  detail: string
  /** One round's worth, as a results row names it. */
  name: string
  unit: [one: string, many: string]
  colour: CssColour
}

export const QUESTION_TYPE_LOOKS: Record<QuestionType, QuestionTypeLook> = {
  [QuestionType.LANDMARK]: {
    label: "Landmarks",
    detail: "Photos of famous places",
    name: "Landmark",
    unit: ["landmark", "landmarks"],
    colour: "#ffb74d"
  },
  [QuestionType.PLACE]: {
    label: "Place names",
    detail: "Cities, capitals and small countries",
    name: "Place name",
    unit: ["place name", "place names"],
    colour: "#4fc3f7"
  },
  [QuestionType.COUNTRY]: {
    label: "Whole countries",
    detail: "Paint a country's shape",
    name: "Whole country",
    unit: ["whole country", "whole countries"],
    colour: "#81c784"
  },
  [QuestionType.FLAG]: {
    label: "Flags",
    detail: "Find the country from its flag",
    name: "Flag",
    unit: ["flag", "flags"],
    colour: "#f06292"
  },
  [QuestionType.FEATURE]: {
    label: "Islands, lakes & seas",
    detail: "Paint a big island, lake or sea",
    name: "Island, lake or sea",
    unit: ["island, lake or sea", "islands, lakes or seas"],
    colour: "#9575cd"
  },
  [QuestionType.STATE]: {
    label: "US states",
    detail: "Paint a state's shape",
    name: "US state",
    unit: ["US state", "US states"],
    colour: "#fff176"
  }
}

/** Sets `--type` to the colour of a type of question, for what is drawn in it. */
export const typeColour = (type: QuestionType): Record<string, string> => {
  return { "--type": QUESTION_TYPE_LOOKS[type].colour }
}

import type { CssColour } from "@whereabouts/shared/colours"
import { QuestionType } from "@whereabouts/shared/questions"

/** How a type of question is named and coloured wherever the client shows one. */
interface QuestionTypeDisplayInfo {
  /** The type's name as a heading, e.g. "Landmarks", where the host picks the game's questions and where practice picks what to practise. */
  heading: string
  /** A line under the heading saying what the questions are, e.g. "Photos of famous places". */
  description: string
  /** What one round of this type is called on the final results, e.g. "Landmark". */
  roundName: string
  /** For counting, e.g. "1 landmark". */
  singularForm: string
  /** For counting, e.g. "3 landmarks". */
  pluralForm: string
  colour: CssColour
}

export const QUESTION_TYPE_DISPLAY_INFO: Record<QuestionType, QuestionTypeDisplayInfo> = {
  [QuestionType.LANDMARK]: {
    heading: "Landmarks",
    description: "Photos of famous places",
    roundName: "Landmark",
    singularForm: "landmark",
    pluralForm: "landmarks",
    colour: "#ffb74d"
  },
  [QuestionType.PLACE]: {
    heading: "Place names",
    description: "Cities, capitals and small countries",
    roundName: "Place name",
    singularForm: "place name",
    pluralForm: "place names",
    colour: "#4fc3f7"
  },
  [QuestionType.COUNTRY]: {
    heading: "Whole countries",
    description: "Paint a country's shape",
    roundName: "Whole country",
    singularForm: "whole country",
    pluralForm: "whole countries",
    colour: "#81c784"
  },
  [QuestionType.FLAG]: {
    heading: "Flags",
    description: "Find the country from its flag",
    roundName: "Flag",
    singularForm: "flag",
    pluralForm: "flags",
    colour: "#f06292"
  },
  [QuestionType.FEATURE]: {
    heading: "Islands, lakes & seas",
    description: "Paint a big island, lake or sea",
    roundName: "Island, lake or sea",
    singularForm: "island, lake or sea",
    pluralForm: "islands, lakes or seas",
    colour: "#9575cd"
  },
  [QuestionType.STATE]: {
    heading: "US states",
    description: "Paint a state's shape",
    roundName: "US state",
    singularForm: "US state",
    pluralForm: "US states",
    colour: "#fff176"
  }
}

/** An inline style handing a question type's colour to CSS as `var(--question-type-colour)`. */
export const questionTypeColourStyle = (type: QuestionType): { "--question-type-colour": CssColour } => ({
  "--question-type-colour": QUESTION_TYPE_DISPLAY_INFO[type].colour
})

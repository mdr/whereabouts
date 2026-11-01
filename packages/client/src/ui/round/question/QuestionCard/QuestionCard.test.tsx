// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { render, waitFor } from "@testing-library/preact"
import { CardPlace, QuestionCard } from "./QuestionCard"
import flagImage from "../FlagImage/FlagImage.module.css"
import { flagCode } from "@whereabouts/shared/ids"
import { ClueType, QuestionType } from "@whereabouts/shared/questions"
import { areaAnswerView, makeQuestionView } from "../../../../test-view"
import type * as flags from "../../../../flags/flags"

vi.mock("../../../../flags/flags", async (original) => ({
  ...(await original<typeof flags>()),
  flagUrl: (code: string) => Promise.resolve(`/flags/${code}.svg`)
}))

const flagRoundOf = (code: string) =>
  makeQuestionView({
    type: QuestionType.FLAG,
    clue: { type: ClueType.FLAG, flag: flagCode(code) },
    answer: areaAnswerView(`${code}-region`, 65)
  })

describe("QuestionCard", () => {
  it("shows the prompt but not the tolerance, which only drives scoring", () => {
    const { container } = render(
      <QuestionCard
        hud={CardPlace.PAINTING}
        q={makeQuestionView({ clue: { type: ClueType.NAME, prompt: "Where is Dublin?" } })}
      />
    )
    expect(container.textContent).toBe("Where is Dublin?")
  })

  it("shows a country round's flag beside the name, and a flag round's own flag", async () => {
    const country = render(
      <QuestionCard
        hud={CardPlace.PAINTING}
        q={makeQuestionView({
          type: QuestionType.COUNTRY,
          clue: { type: ClueType.NAME, prompt: "Paint the whole of Germany" },
          answer: areaAnswerView("germany-region", 65),
          countryFlag: flagCode("de")
        })}
      />
    )
    await waitFor(() =>
      expect(country.container.querySelector(`.${flagImage.flag} img`)!.getAttribute("src")).toBe("/flags/de.svg")
    )
    const flagRound = render(<QuestionCard hud={CardPlace.PAINTING} q={flagRoundOf("fr")} />)
    await waitFor(() =>
      expect(flagRound.container.querySelector(`.${flagImage.flag} img`)!.getAttribute("src")).toBe("/flags/fr.svg")
    )
    const place = render(<QuestionCard hud={CardPlace.PAINTING} q={makeQuestionView()} />)
    expect(place.container.querySelectorAll(`.${flagImage.flag}`)).toHaveLength(0)
  })
})

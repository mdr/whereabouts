// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { render } from "@testing-library/preact"
import { SmallPhoto } from "./SmallPhoto"
import picture from "../SmallPicture.module.css"
import { QuestionImage } from "../../round/question/QuestionImage/QuestionImage"
import questionImage from "../../round/question/QuestionImage/QuestionImage.module.css"
import { commonsFile } from "@whereabouts/shared/ids"

describe("SmallPhoto", () => {
  it("shows the rounds' rendition of the photo, which the page already has", () => {
    const image = commonsFile("Some_file.jpg")
    const { container } = render(<SmallPhoto image={image} />)
    const shown = render(
      <QuestionImage image={image} credit={false} painting />
    ).container.querySelector<HTMLImageElement>(`.${questionImage.thumb} img`)!
    expect(container.querySelector<HTMLImageElement>(`.${picture.smallPicture} img`)!.src).toBe(shown.src)
  })
})

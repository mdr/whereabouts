import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

/** Lines describing each WCAG A/AA violation on the page, empty when there are none. */
const accessibilityViolations = async (page: Page, name: string): Promise<string[]> => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // MapLibre's canvas container is the library's markup, not ours to fix.
    .exclude(".maplibregl-canvas-container")
    .analyze()
  await test.info().attach(`axe-${name}.json`, {
    body: JSON.stringify(results, undefined, 2),
    contentType: "application/json"
  })
  return results.violations.map((violation) => {
    const targets = violation.nodes.map((node) => `${node.html.slice(0, 120)} [${node.target.join(" ")}]`).join(" | ")
    return `${violation.id} (${violation.impact}): ${violation.help}: ${targets}`
  })
}

/** The page has no WCAG A/AA violations; a failure lists one line per violated rule. */
export const expectAccessible = async (page: Page, name: string): Promise<void> => {
  expect(await accessibilityViolations(page, name), `${name} has no accessibility violations`).toEqual([])
}

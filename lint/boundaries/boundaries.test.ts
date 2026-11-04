import { describe, expect, it } from "vite-plus/test"
import { clientLayerProblem, importedPath, packageProblem, testSupportProblem, type Import } from "./boundaries.ts"

const makeImport = (from: string, specifier: string, rest: Partial<Import> = {}): Import => ({
  from,
  to: importedPath(from, specifier) ?? "",
  typeOnly: false,
  dynamic: false,
  ...rest
})

describe("importedPath", () => {
  it("resolves relative imports and the workspace packages, not outside ones", () => {
    expect(importedPath("packages/client/src/paint/tool.ts", "../map/map")).toBe("packages/client/src/map/map")
    expect(importedPath("packages/server/src/app.ts", "@whereabouts/shared/geo")).toBe("packages/shared/geo")
    expect(importedPath("packages/server/src/app.ts", "fastify")).toBeUndefined()
  })
})

describe("packageProblem", () => {
  it.each([
    ["packages/shared/src/geo.ts", "../../client/src/map/map"],
    ["packages/shared/src/geo.ts", "@whereabouts/server/src/app"],
    ["packages/server/src/app.ts", "../../client/src/router"],
    ["packages/client/src/router.ts", "../../server/src/app"],
    ["packages/client/browser/tests/x.iwft.ts", "../../../server/src/app.ts"]
  ])("forbids %s importing %s", (from, specifier) => {
    expect(packageProblem(makeImport(from, specifier))).toBeDefined()
  })

  it.each([
    ["packages/client/src/router.ts", "@whereabouts/shared/ids"],
    ["packages/server/src/app.ts", "./rooms"],
    ["packages/client/browser/game-server/game-server.ts", "../../../server/src/test-support/in-process-server.ts"]
  ])("allows %s importing %s", (from, specifier) => {
    expect(packageProblem(makeImport(from, specifier))).toBeUndefined()
  })
})

describe("testSupportProblem", () => {
  const helper = "@whereabouts/shared/test-support/factories"

  it("forbids test-support in code that ships", () => {
    expect(testSupportProblem(makeImport("packages/client/src/router.ts", helper))).toBeDefined()
  })

  it.each([
    "packages/client/src/router.test.ts",
    "packages/server/src/iwbt/lobby.iwbt.ts",
    "packages/server/src/test-support/test-player.ts",
    "packages/client/browser/tests/x.iwft.ts"
  ])("allows it in %s", (from) => {
    expect(testSupportProblem(makeImport(from, helper))).toBeUndefined()
  })
})

describe("clientLayerProblem", () => {
  const src = "packages/client/src/"

  it.each([
    [`${src}ui/Card/Card.tsx`, "../../screens/Home/Home"],
    [`${src}paint/tool.ts`, "../ui/format"],
    [`${src}screens/results/Results/Results.tsx`, "../../reveal/RevealScores/RevealScores"],
    [`${src}ui/VrButton/VrButton.tsx`, "../../vr/globe/globe"],
    [`${src}vr/view/view.ts`, "../globe/globe"]
  ])("forbids %s importing %s", (from, specifier) => {
    expect(clientLayerProblem(makeImport(from, specifier))).toBeDefined()
  })

  it.each([
    [`${src}app.tsx`, "./screens/Home/Home"],
    [`${src}screens/GameScreen/GameScreen.tsx`, "../lobby/Lobby/Lobby"],
    [`${src}screens/GameScreen/GameScreen.tsx`, "../InGame/InGame"],
    [`${src}screens/lobby/Lobby/Lobby.tsx`, "../invite/Roster/Roster"],
    [`${src}screens/reveal/Reveal/Reveal.tsx`, "../../../ui/round/Clue/Clue"],
    [`${src}ui/VrButton/VrButton.tsx`, "../../vr/vr-support"],
    [`${src}screens/InGame/InGame.tsx`, "../../vr/view/game-vr-view"],
    [`${src}vr/vr-support.ts`, "./load-stage"]
  ])("allows %s importing %s", (from, specifier) => {
    expect(clientLayerProblem(makeImport(from, specifier))).toBeUndefined()
  })

  it("allows the VR code as types only, or loaded on demand", () => {
    const from = `${src}ui/VrButton/VrButton.tsx`
    expect(clientLayerProblem(makeImport(from, "../../vr/index", { typeOnly: true }))).toBeUndefined()
    expect(clientLayerProblem(makeImport(from, "../../vr/index", { dynamic: true }))).toBeUndefined()
  })
})

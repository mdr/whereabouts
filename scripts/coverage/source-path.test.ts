import { describe, expect, it } from "vite-plus/test"
import { isMeasured, repoSourcePath } from "./source-path.ts"

const repo = "/work/whereabouts"

describe("repoSourcePath", () => {
  it("keeps a path that already starts at a package", () => {
    expect(repoSourcePath("packages/shared/src/geo.ts", undefined, repo)).toBe("packages/shared/src/geo.ts")
  })

  it("places a client module from the dev server in the client package", () => {
    expect(repoSourcePath("App.tsx", "localhost-5173/src/ui/App.tsx", repo)).toBe("packages/client/src/ui/App.tsx")
  })

  it("places a module the dev server serves from elsewhere by its file", () => {
    expect(repoSourcePath("geo.ts", "localhost-5173/@fs/work/whereabouts/packages/shared/src/geo.ts", repo)).toBe(
      "packages/shared/src/geo.ts"
    )
  })

  it("places a module the test worker ran beside its file", () => {
    expect(repoSourcePath("rooms.ts", "packages/server/src/rooms.ts", repo)).toBe("packages/server/src/rooms.ts")
  })
})

describe("isMeasured", () => {
  it("measures application source", () => {
    expect(isMeasured("packages/client/src/ui/App.tsx")).toBe(true)
    expect(isMeasured("packages/server/src/rooms.ts")).toBe(true)
  })

  it("leaves out tests, test support, vendored code, styles and scripts", () => {
    expect(isMeasured("packages/shared/src/geo.test.ts")).toBe(false)
    expect(isMeasured("packages/server/src/iwbt/dev-players.iwbt.ts")).toBe(false)
    expect(isMeasured("packages/server/src/test-support/test-player.ts")).toBe(false)
    expect(isMeasured("packages/server/src/vendor/WSTransport.ts")).toBe(false)
    expect(isMeasured("packages/client/src/global.css")).toBe(false)
    expect(isMeasured("packages/client/scripts/build-flags.ts")).toBe(false)
  })
})

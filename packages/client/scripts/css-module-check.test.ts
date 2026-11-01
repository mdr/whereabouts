import { transform } from "lightningcss"
import { describe, expect, it } from "vite-plus/test"
import { composesErrors } from "./css-module-check.mjs"

const KIT = ["overlay", "truncate"]

function check(css: string, others: Record<string, string[]> = { "../kit.module.css": KIT }) {
  const { exports } = transform({ filename: "a.module.css", code: new TextEncoder().encode(css), cssModules: true })
  return composesErrors({ file: "a.module.css", css, exports: exports ?? {}, lookup: (specifier) => others[specifier] })
}

describe("composesErrors", () => {
  it("accepts composes of existing classes, local, imported and global", () => {
    const css = `.base { color: red }\n.a { composes: base; composes: overlay truncate from "../kit.module.css"; composes: x from global }`
    expect(check(css)).toEqual([])
  })

  it("names the line, class and module for a missing class, with a suggestion", () => {
    const css = `/* composes: overlay from "../kit.module.css" */\n.a {\n  composes: overlya from "../kit.module.css";\n}`
    expect(check(css)).toEqual([
      `a.module.css:3: composes "overlya" from "../kit.module.css", which does not define it. Did you mean "overlay"?`
    ])
  })

  it("gives no suggestion when nothing is close", () => {
    expect(check(`.a { composes: banana from "../kit.module.css" }`)[0]).not.toContain("Did you mean")
  })

  it("reports a missing file", () => {
    expect(check(`.a { composes: overlay from "./gone.module.css" }`)).toEqual([
      `a.module.css:1: composes "overlay" from "./gone.module.css", but that file does not exist.`
    ])
  })

  it("reports a local class the module doesn't define", () => {
    expect(check(`.base { color: red }\n.a { composes: bsae }`)).toEqual([
      `a.module.css:2: composes "bsae", which this module does not define. Did you mean "base"?`
    ])
  })
})

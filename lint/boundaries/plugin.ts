import { relative, resolve, sep } from "node:path"
import { clientLayerProblem, importedPath, packageProblem, testSupportProblem, type Import } from "./boundaries.ts"

const ROOT = resolve(import.meta.dirname, "../..")

// The parts of the ESTree nodes these rules read.
interface Node {
  type: string
}

interface ModuleReference extends Node {
  source: { type: string; value: unknown } | undefined
  importKind?: string
  exportKind?: string
}

interface RuleContext {
  filename: string
  report: (problem: { node: Node; message: string }) => void
}

type Visitor = (node: ModuleReference) => void

interface Rule {
  meta: { type: string; schema: [] }
  create: (context: RuleContext) => Record<string, Visitor>
}

const importRule = (problem: (found: Import) => string | undefined): Rule => ({
  meta: { type: "problem", schema: [] },
  create(context: RuleContext) {
    const from = relative(ROOT, context.filename).split(sep).join("/")
    const check = (node: ModuleReference, typeOnly: boolean, dynamic: boolean): void => {
      if (node.source?.type !== "Literal" || typeof node.source.value !== "string") return
      const to = importedPath(from, node.source.value)
      const message = to === undefined ? undefined : problem({ from, to, typeOnly, dynamic })
      if (message !== undefined) context.report({ node, message })
    }
    return {
      ImportDeclaration: (node: ModuleReference): void => check(node, node.importKind === "type", false),
      ImportExpression: (node: ModuleReference): void => check(node, false, true),
      ExportNamedDeclaration: (node: ModuleReference): void => check(node, node.exportKind === "type", false),
      ExportAllDeclaration: (node: ModuleReference): void => check(node, node.exportKind === "type", false)
    }
  }
})

export default {
  meta: { name: "boundaries" },
  rules: {
    packages: importRule(packageProblem),
    "test-support": importRule(testSupportProblem),
    "client-layers": importRule(clientLayerProblem)
  }
}

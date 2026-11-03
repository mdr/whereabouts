import { existsSync } from "node:fs"
import { basename, dirname, join } from "node:path"

const SUFFIX = "TestIds.ts"

// The parts of the ESTree nodes this rule reads.
interface Node {
  type: string
}

interface Identifier extends Node {
  name: string
}

interface Literal extends Node {
  value: unknown
}

interface Property extends Node {
  computed: boolean
  key: { name?: string; value?: string }
  value: Literal
}

interface ObjectExpression extends Node {
  properties: Property[]
}

interface Wrapper extends Node {
  expression: Expression | undefined
}

type Expression = Node | Wrapper | ObjectExpression

interface Declarator extends Node {
  id: Identifier
  init: Expression | undefined
}

interface Statement extends Node {
  declaration?: { type: string; declarations: Declarator[] }
}

interface Program extends Node {
  body: Statement[]
}

interface RuleContext {
  filename: string
  report: (problem: { node: Node; message: string }) => void
}

const isObject = (node: Expression | undefined): node is ObjectExpression => node?.type === "ObjectExpression"

const isWrapper = (node: Expression | undefined): node is Wrapper =>
  node?.type === "TSAsExpression" || node?.type === "TSSatisfiesExpression"

const objectOf = (init: Expression | undefined): ObjectExpression | undefined => {
  let node = init
  while (isWrapper(node)) node = node.expression
  return isObject(node) ? node : undefined
}

const keyOf = (property: Property): string | undefined =>
  property.type === "Property" && !property.computed ? (property.key.name ?? property.key.value) : undefined

const exportedDeclarations = (program: Program): Declarator[] =>
  program.body
    .filter((statement) => statement.type === "ExportNamedDeclaration")
    .flatMap((statement) =>
      statement.declaration?.type === "VariableDeclaration" ? statement.declaration.declarations : []
    )

const checkProperty = (context: RuleContext, component: string, property: Property): void => {
  const key = keyOf(property)
  if (key === undefined) {
    context.report({ node: property, message: 'Test IDs are plain `key: "Component.key"` properties.' })
    return
  }
  const expected = `${component}.${key}`
  if (property.value.type !== "Literal" || property.value.value !== expected) {
    context.report({ node: property, message: `The id for ${key} must be the string "${expected}".` })
  }
}

const checkDeclaration = (
  context: RuleContext,
  component: string,
  exportName: string,
  declaration: Declarator
): void => {
  if (declaration.id.name !== exportName) {
    context.report({ node: declaration.id, message: `Export ${exportName}, not ${declaration.id.name}.` })
    return
  }
  const object = objectOf(declaration.init)
  if (!object) {
    context.report({ node: declaration, message: `${exportName} must be an object literal.` })
    return
  }
  for (const property of object.properties) checkProperty(context, component, property)
}

/** A `FooTestIds.ts` exports `fooTestIds`, sits beside `Foo.tsx`, and names each id `"Foo.key"`. */
const testIdFile = {
  meta: { type: "problem", schema: [] },
  create(context: RuleContext) {
    const file = basename(context.filename)
    if (!file.endsWith(SUFFIX)) return {}
    const component = file.slice(0, -SUFFIX.length)
    const exportName = `${component[0]!.toLowerCase()}${component.slice(1)}TestIds`
    return {
      Program(program: Program): void {
        if (!existsSync(join(dirname(context.filename), `${component}.tsx`))) {
          context.report({ node: program, message: `${file} has no ${component}.tsx beside it.` })
        }
        const declarations = exportedDeclarations(program)
        if (!declarations.some((declaration) => declaration.id.name === exportName)) {
          context.report({ node: program, message: `${file} must export ${exportName}.` })
        }
        for (const declaration of declarations) checkDeclaration(context, component, exportName, declaration)
      }
    }
  }
}

export default { meta: { name: "test-ids" }, rules: { "test-id-file": testIdFile } }

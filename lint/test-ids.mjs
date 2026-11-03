import { existsSync } from "node:fs"
import { basename, dirname, join } from "node:path"

const SUFFIX = "TestIds.ts"

const objectOf = (init) => {
  let node = init
  while (node?.type === "TSAsExpression" || node?.type === "TSSatisfiesExpression") node = node.expression
  return node?.type === "ObjectExpression" ? node : undefined
}

const keyOf = (property) =>
  property.type === "Property" && !property.computed ? (property.key.name ?? property.key.value) : undefined

const exportedDeclarations = (program) =>
  program.body
    .filter((statement) => statement.type === "ExportNamedDeclaration")
    .flatMap((statement) =>
      statement.declaration?.type === "VariableDeclaration" ? statement.declaration.declarations : []
    )

const checkProperty = (context, component, property) => {
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

const checkDeclaration = (context, component, exportName, declaration) => {
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
  create(context) {
    const file = basename(context.filename)
    if (!file.endsWith(SUFFIX)) return {}
    const component = file.slice(0, -SUFFIX.length)
    const exportName = `${component[0].toLowerCase()}${component.slice(1)}TestIds`
    return {
      Program(program) {
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

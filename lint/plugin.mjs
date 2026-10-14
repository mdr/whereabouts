/** Rules of this repo that Oxlint has no built-in for. */
const noNull = {
  meta: {
    type: "problem",
    docs: {
      description: "One absence value: undefined. Convert an outside API's null where it is called (`?? undefined`)."
    }
  },
  create(context) {
    const report = (node, message) => context.report({ node, message })
    return {
      Literal(node) {
        if (node.raw === "null") report(node, "Use undefined, not null.")
      },
      TSNullKeyword(node) {
        report(node, "Use undefined, not null.")
      },
      MemberExpression(node) {
        if (node.property.type === "Identifier" && node.property.name === "toBeNull") {
          report(node.property, "Use toBeUndefined, not toBeNull.")
        }
      }
    }
  }
}

export default { meta: { name: "hunch" }, rules: { "no-null": noNull } }

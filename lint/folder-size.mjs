import { readdirSync } from "node:fs"
import { basename, dirname, relative } from "node:path"

const CODE = /\.(ts|tsx|js|mjs)$/

/** Fails a folder with more entries than fit on one editor screen. */
const maxEntries = {
  meta: { type: "suggestion", schema: [{ type: "integer", minimum: 1 }] },
  create(context) {
    return {
      Program(node) {
        const max = context.options[0] ?? 30
        const folder = dirname(context.filename)
        const entries = readdirSync(folder).filter((e) => !e.startsWith("."))
        // Report once per folder, from its first code file.
        if (entries.filter((e) => CODE.test(e)).sort()[0] !== basename(context.filename)) return
        if (entries.length > max) {
          context.report({
            node,
            message: `${relative(process.cwd(), folder)} has ${entries.length} entries (max ${max}); group related files into subfolders.`
          })
        }
      }
    }
  }
}

export default { meta: { name: "folders" }, rules: { "max-entries": maxEntries } }

// @ts-check
import { defineConfig } from "eslint/config"
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import vitest from "@vitest/eslint-plugin"
import globals from "globals"

export default defineConfig(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/vendor/**", "result", ".direnv"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true, allowBoolean: true }],
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
      // `||` on a string treats "" as missing too, which is usually the intent.
      "@typescript-eslint/prefer-nullish-coalescing": ["error", { ignorePrimitives: { string: true } }],
      "@typescript-eslint/no-confusing-void-expression": "off",
      // Interface-conforming async methods often have nothing to await.
      "@typescript-eslint/require-await": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"]
    }
  },
  {
    // Client: browser globals and Preact hooks discipline.
    files: ["packages/client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    // Only the rules of hooks. The plugin's recommended set also carries the
    // React Compiler rules, which misread this code: they know `useRef` only
    // from "react", not "preact/hooks", and treat a signal write through a
    // hook's result (`paint.version.value++`) as mutating a frozen value.
    // exhaustive-deps stays off: signals and imperative controllers are read
    // inside effects deliberately.
    rules: { "react-hooks/rules-of-hooks": "error" }
  },
  {
    files: ["packages/server/src/**/*.ts"],
    languageOptions: { globals: globals.node }
  },
  {
    // Node programs driving a browser; page.evaluate callbacks run in the page.
    files: ["packages/client/browser/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ["packages/client/browser/e2e/**/*.ts"],
    rules: { "no-console": "off" }
  },
  {
    // Scripts and configs are plain Node programs outside any tsconfig.
    files: ["**/*.mjs", "**/*.config.{js,ts}", "eslint.config.js"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { ...globals.node, ...globals.browser }
    },
    rules: { ...tseslint.configs.disableTypeChecked.rules, "no-console": "off" }
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      // A stray .only makes CI pass while skipping the rest of the file.
      "vitest/no-focused-tests": "error",
      // Vitest takes a message as expect's second argument.
      "vitest/valid-expect": ["error", { maxArgs: 2 }],
      // The server tests' until() helpers throw when no state matches in time.
      "vitest/expect-expect": ["error", { assertFunctionNames: ["expect", "*.until", "*.untilLatest"] }],
      // Tests over the game data branch on each item's kind to choose what to check.
      "vitest/no-conditional-expect": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // No-op callbacks and stubs are the point in a test.
      "@typescript-eslint/no-empty-function": "off"
    }
  }
)

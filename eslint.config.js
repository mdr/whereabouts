// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/vendor/**", "result", ".direnv"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true, allowBoolean: true }],
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
      "@typescript-eslint/no-confusing-void-expression": "off",
      // Interface-conforming async methods often have nothing to await.
      "@typescript-eslint/require-await": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  {
    // Client: browser globals and Preact hooks discipline.
    files: ["packages/client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Signals and imperative controllers are read inside effects deliberately.
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["packages/server/src/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    // Scripts and configs are plain Node programs outside any tsconfig.
    files: ["**/*.mjs", "**/*.config.{js,ts}", "eslint.config.js"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { ...tseslint.configs.disableTypeChecked.rules, "no-console": "off" },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-unsafe-assignment": "off", "@typescript-eslint/no-explicit-any": "off" },
  },
);

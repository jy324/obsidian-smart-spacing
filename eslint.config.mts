import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  {
    ignores: ["main.js", "build/", "dist/", "node_modules/", "esbuild.config.mjs", "version-bump.mjs", "verify_logic.js", "scripts/", "test.ts"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // @ts-expect-error: obsidianmd types are slightly incompatible with new eslint types
  ...obsidianmd.configs.recommended,
  {
    plugins: {
      "obsidianmd": obsidianmd,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["error", { allow: ["warn", "error", "debug"] }],
      "no-restricted-imports": ["error", "fs", "node:fs", "fs/promises", "node:fs/promises"],
      "obsidianmd/ui/sentence-case": "error", // Upgrade warning to error to match bot
    },
  }
);

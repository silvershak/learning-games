import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/", ".specify/", ".claude/", "docs/", "**/*.min.js"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
  },
];

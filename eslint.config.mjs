import globals from "globals"; 
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["**/*.js"], 
    languageOptions: { sourceType: "script" },
  },
  {
    languageOptions: { 
      globals: { 
        ...globals.browser, 
        ...globals.webextensions 
      } 
    }
  },
  {
    ...pluginJs.configs.recommended,
    rules: {
      ...pluginJs.configs.recommended.rules,
      "no-var": "error",
      "curly": "error",
    }
  }
];

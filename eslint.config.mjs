import globals from "globals"; 
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["src/**/*.js"],
    languageOptions: { sourceType: "script" },
  },
  {
    files: ["tests/**/*.js", "playwright.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        // Service worker globals referenced inside sw.evaluate() callbacks.
        convertValue: 'readonly',
        _testGetCache: 'readonly',
        _testGetTimeoutFlag: 'readonly',
        _testSeedCache: 'readonly',
        _testClearCache: 'readonly',
        _testSetConvertTimeoutMs: 'readonly',
        _testCallRefreshRate: 'readonly',
      },
    },
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

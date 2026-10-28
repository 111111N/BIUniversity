// eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: globals.browser,
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "@typescript-eslint": tseslint.plugin,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["error", "warn"] }],
      // Named scroll regions and embedded viewers need keyboard focus without pretending to be buttons.
      "jsx-a11y/no-noninteractive-tabindex": ["error", {
        ...jsxA11y.configs.recommended.rules["jsx-a11y/no-noninteractive-tabindex"][1],
        roles: ["tabpanel", "region"],
        tags: ["object"],
      }],
    },
  },
  {
    files: ["build/**/*.ts", "scripts/**/*.mjs", "vite.config.ts", "eslint.config.js", "eslint.config.test.mjs"],
    languageOptions: { globals: globals.node },
  },
]);

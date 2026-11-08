import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Formatierung übernimmt Prettier, ESLint prüft nur die Logik
  prettier,
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    "playwright-report/**",
    "test-results/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

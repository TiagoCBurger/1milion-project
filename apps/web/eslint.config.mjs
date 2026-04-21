import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: [
      "**/__tests__/**/*",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Force everyone onto next/image — raw <img> loses lazy loading,
    // responsive sizes, and Cloudflare-served optimisations. Exceptions
    // (e.g. the Meta pixel noscript) must opt-out explicitly.
    rules: {
      "@next/next/no-img-element": "error",
    },
  },
]);

export default eslintConfig;

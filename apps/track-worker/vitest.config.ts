import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@vibefly/shared": "../../packages/shared/src/index.ts",
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests-db/**/*.test.ts"],
    setupFiles: ["tests-db/setup.ts"],
    environment: "node",
    pool: "threads",
  },
});

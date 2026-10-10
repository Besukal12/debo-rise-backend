import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    maxWorkers: 1,
  },
});
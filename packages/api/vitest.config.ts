import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@simulacrum/agents": resolve(__dirname, "../agents/src/index.ts"),
      "@simulacrum/coordination": resolve(__dirname, "../coordination/src/index.ts"),
      "@simulacrum/core": resolve(__dirname, "../core/src/index.ts"),
      "@simulacrum/insurance": resolve(__dirname, "../insurance/src/index.ts"),
      "@simulacrum/markets": resolve(__dirname, "../markets/src/index.ts"),
      "@simulacrum/reputation": resolve(__dirname, "../reputation/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});

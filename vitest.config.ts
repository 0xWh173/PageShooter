import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@pageshooter/shared": path.resolve(import.meta.dirname, "packages/shared/src/index.ts"),
      "@pageshooter/game-engine": path.resolve(import.meta.dirname, "packages/game-engine/src/index.ts")
    }
  },
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"]
    }
  }
});

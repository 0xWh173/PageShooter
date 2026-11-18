import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@pageshooter/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@pageshooter/game-engine": path.resolve(__dirname, "../../packages/game-engine/src/index.ts")
    }
  },
  server: {
    port: 3234,
    open: false
  }
});


import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  optimizeDeps: { exclude: ["web-ifc"] },
  // pptxgenjs installs an npm package named "https" (a stub). Keep "https" meaning
  // Node's module, which the browser build treats as external, as before.
  resolve: { alias: [{ find: /^https$/, replacement: "node:https" }] },
  test: { globals: true, environment: "node", include: ["tests/**/*.test.ts"] },
});

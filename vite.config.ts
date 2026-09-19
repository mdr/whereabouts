import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, open: false },
  // MapLibre ships its own web worker; pre-bundling the package breaks the
  // worker URL resolution in dev, so leave it to the browser.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  test: { include: ["src/**/*.test.ts"] },
});

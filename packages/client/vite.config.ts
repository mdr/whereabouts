import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    open: false,
    proxy: {
      // Game server (Fastify + Rivalis) during development.
      "/ws": { target: "ws://localhost:8787", ws: true },
      "/api": { target: "http://localhost:8787" },
    },
  },
  // MapLibre ships its own web worker; pre-bundling the package breaks the
  // worker URL resolution in dev, so leave it to the browser.
  optimizeDeps: { exclude: ["maplibre-gl"] },
});

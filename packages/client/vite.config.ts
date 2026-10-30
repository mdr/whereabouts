import { defineConfig, lazyPlugins } from "vite-plus"
import preact from "@preact/preset-vite"

// Overridable so a second pair of dev servers can run beside the first.
const clientPort = Number(process.env.CLIENT_PORT ?? 5173)
const gamePort = Number(process.env.PORT ?? 8787)

export default defineConfig({
  plugins: lazyPlugins(() => [preact()]),
  server: {
    port: clientPort,
    strictPort: true,
    open: false,
    // A Cloudflare quick tunnel, for opening the dev server on a headset (see README).
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      // Game server (Fastify + Rivalis) during development.
      "/ws": { target: `ws://localhost:${gamePort}`, ws: true },
      "/api": { target: `http://localhost:${gamePort}` }
    }
  },
  // For the breakpoints' names (src/media.css).
  css: { transformer: "lightningcss", lightningcss: { drafts: { customMedia: true } } },
  // MapLibre ships its own web worker; pre-bundling the package breaks the
  // worker URL resolution in dev, so leave it to the browser.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  // The map worker (see src/map.ts) is created as a module worker.
  worker: { format: "es" }
})

import "./src/env"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig, type Plugin } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

// Nitro's dev middleware treats requests with sec-fetch-dest values like
// "image" as static assets and never routes them to the app, which breaks
// the app-served /branding/* endpoints in dev (production is unaffected).
// Stripping the header makes Nitro fall back to extension-based detection,
// so these extension-less routes reach the app handler.
function brandingAssetPassthrough(): Plugin {
  return {
    name: "branding-asset-passthrough",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith("/branding/")) {
          delete req.headers["sec-fetch-dest"]
        }
        next()
      })
    },
  }
}

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "UNUSED_EXTERNAL_IMPORT") {
          return
        }

        warn(warning)
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
  plugins: [
    brandingAssetPassthrough(),
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart({
      srcDirectory: "src",
      router: {
        routesDirectory: "routes",
      },
    }),
    nitro(),
    viteReact(),
  ],
})

import "./src/env"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import tsconfigPaths from "vite-tsconfig-paths"

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
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart({
      srcDirectory: "src",
      router: {
        routesDirectory: "routes",
      },
    }),
    viteReact(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "logo-192.png",
        "logo-256.png",
        "logo-512.png",
        "logo-maskable-512.png",
      ],
      manifest: {
        name: "Jellything",
        short_name: "Jellything",
        description: "User management and invitation system for Jellyfin",
        theme_color: "#615ff0",
        background_color: "#ffffff",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/logo-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/logo-256.png",
            sizes: "256x256",
            type: "image/png",
          },
          {
            src: "/logo-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/logo-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallbackAllowlist: [],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => {
              if (url.pathname.startsWith("/rpc/")) {
                return false
              }

              return (
                request.destination === "style" ||
                request.destination === "script"
              )
            },
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-assets",
            },
          },
          {
            urlPattern: ({ request, url }) => {
              if (url.pathname.startsWith("/rpc/")) {
                return false
              }

              return request.destination === "font"
            },
            handler: "CacheFirst",
            options: {
              cacheName: "font-assets",
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: ({ request, url }) => {
              if (url.pathname.startsWith("/rpc/")) {
                return false
              }

              return request.destination === "image"
            },
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "image-assets",
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
})

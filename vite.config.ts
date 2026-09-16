import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * GitHub Pages base path
 *
 * - Local preview and custom domain at site root: `/` (default)
 * - Project site for github.com/1319Dev/priority-property-pros:
 *   `/priority-property-pros/`
 *
 * Set with BASE_PATH. Always include a leading and trailing slash
 * except for the root path `/`.
 */
function resolveBase(): string {
  const fromEnv = process.env.BASE_PATH;
  if (!fromEnv || fromEnv === "/") return "/";
  const withLeading = fromEnv.startsWith("/") ? fromEnv : `/${fromEnv}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

export default defineConfig(({ mode }) => {
  const base = resolveBase();

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        disable: mode === "test",
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.svg",
          "robots.txt",
          "offline.html",
          "apple-touch-icon.png",
          "og-image.svg",
          "icons/icon-192.png",
          "icons/icon-512.png",
          "icons/icon-512-maskable.png",
        ],
        manifest: {
          name: "Priority Property Pros",
          short_name: "PPP",
          description:
            "Your project. Local pros. One simple place. A local home-services marketplace connecting property owners with independent contractors.",
          theme_color: "#1A3C2E",
          background_color: "#FBF8F1",
          display: "standalone",
          orientation: "portrait-primary",
          start_url: "./",
          scope: "./",
          lang: "en-US",
          id: "priority-property-pros",
          categories: ["lifestyle", "business"],
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2,txt}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/offline\.html$/],
          additionalManifestEntries: [{ url: "offline.html", revision: "phase1" }],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "src"),
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
      css: true,
    },
  };
});

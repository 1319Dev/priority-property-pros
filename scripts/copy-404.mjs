import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const indexPath = resolve("dist/index.html");
const notFoundPath = resolve("dist/404.html");

if (!existsSync(indexPath)) {
  console.error("dist/index.html missing — run vite build first.");
  process.exit(1);
}

copyFileSync(indexPath, notFoundPath);
console.log("Copied dist/index.html → dist/404.html for GitHub Pages SPA fallback (old /services and /about paths included).");

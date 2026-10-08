import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Static paths that must exist as real files on GitHub Pages.
 * A copied 404.html still answers with HTTP 404, so each public route also
 * gets `<route>.html` and `<route>/index.html` (both copies of the SPA shell).
 */
export const GITHUB_PAGES_SPA_ROUTES = [
  "/find-a-pro",
  "/how-it-works",
  "/pricing",
  "/become-a-pro",
  "/faq",
  "/contact",
  "/reviews",
  "/services",
  "/about",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/auth/reset-password",
  "/auth/verify",
  "/auth/callback",
  "/account/status",
  "/account/activate",
  "/post-project",
  "/trust",
  "/notifications",
  "/app/customer",
  "/app/pro",
  "/app/verifier",
  "/app/admin",
] as const;

export function spaShellDestinations(route: string): string[] {
  const rel = route.replace(/^\//, "").replace(/\/+$/, "");
  if (!rel || rel.includes("..")) {
    throw new Error(`Refusing SPA shell path: ${route}`);
  }
  return [`${rel}.html`, `${rel}/index.html`];
}

export function writeSpaShells(distDir: string, indexPath = resolve(distDir, "index.html")): string[] {
  if (!existsSync(indexPath)) {
    throw new Error(`${indexPath} missing — run vite build first.`);
  }
  const notFoundPath = resolve(distDir, "404.html");
  copyFileSync(indexPath, notFoundPath);
  const written = [notFoundPath];
  for (const route of GITHUB_PAGES_SPA_ROUTES) {
    for (const relativePath of spaShellDestinations(route)) {
      const target = resolve(distDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(indexPath, target);
      written.push(target);
    }
  }
  return written;
}

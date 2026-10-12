import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { applyRouteMetaToHtml } from "../seo/routeMeta.ts";

/**
 * Static paths that must exist as real files on GitHub Pages.
 * A copied 404.html still answers with HTTP 404, so each public route also
 * gets `<route>.html` and `<route>/index.html` (both copies of the SPA shell).
 *
 * Those copies are the SPA document at the real path. Query and hash stay put,
 * including /auth/reset-password#access_token=… recovery links. Do not swap
 * this for a path-rewriting 404 redirect; that drops the fragment.
 *
 * Each copy gets that route's own title, description, canonical, and robots
 * tags (src/lib/seo/routeMeta.ts) so crawlers that read the raw HTML do not see
 * every page as a duplicate of the homepage. 404.html is marked noindex.
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
  "/login",
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
  "/terms",
  "/privacy",
  "/refunds",
  "/community-guidelines",
  "/contractor-terms",
  "/content-guidelines",
  "/app/customer",
  "/app/pro",
  "/app/verifier",
  "/app/admin",
  "/app/notifications",
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
  const shell = readFileSync(indexPath, "utf8");
  const notFoundPath = resolve(distDir, "404.html");
  writeFileSync(notFoundPath, applyRouteMetaToHtml(shell, "/404", { notFound: true }));
  const written = [notFoundPath];
  for (const route of GITHUB_PAGES_SPA_ROUTES) {
    const html = applyRouteMetaToHtml(shell, route);
    for (const relativePath of spaShellDestinations(route)) {
      const target = resolve(distDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, html);
      written.push(target);
    }
  }
  return written;
}

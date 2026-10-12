/**
 * Per-route <title>, description, canonical, and robots rules.
 *
 * This file has no imports on purpose: the GitHub Pages build script
 * (scripts/copy-404.ts, run with `node --experimental-strip-types`) uses it to
 * write route-specific static HTML shells, and the app uses it at runtime
 * (RouteMetaSync) to keep the head in sync on client-side navigation.
 *
 * Copy only. Fee wording must match src/data/pricing.ts ($9.99 one-time account
 * activation, $4.99 Connection Fee, no percentage of the job).
 */

export const SITE_ORIGIN = "https://prioritypropertypros.com";
export const SITE_NAME = "Priority Property Pros";

export const DEFAULT_TITLE = "Priority Property Pros | Your project. Local pros. One simple place.";
export const DEFAULT_DESCRIPTION =
  "Priority Property Pros connects local homeowners and property owners with independent local contractors. Join for a one-time $9.99 account activation — not $9.99/month. Your project. Local pros. One simple place. PPP is a marketplace — not the contractor.";

export const NOT_FOUND_TITLE = "Page not found | Priority Property Pros";

export type RouteMeta = {
  title: string;
  description: string;
  /** Keep the page out of search results (account, auth, and app pages). */
  noindex?: boolean;
};

export const ROUTE_META: Record<string, RouteMeta> = {
  "/": { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  "/find-a-pro": {
    title: "Find a Pro | Priority Property Pros",
    description:
      "Browse approved, independent local contractors on Priority Property Pros by service and area. Contact details stay private until you and a pro connect on a project.",
  },
  "/how-it-works": {
    title: "How It Works | Priority Property Pros",
    description:
      "Post your project, get connected with independent local contractors, and hire the pro you choose. PPP is a marketplace, not the contractor, and does not take a percentage of the job.",
  },
  "/pricing": {
    title: "Pricing | Priority Property Pros",
    description:
      "A one-time $9.99 account activation, not a monthly subscription. Homeowners and businesses pay no Connection Fee. Contractors pay $4.99 only when they choose to connect. No percentage of the job.",
  },
  "/become-a-pro": {
    title: "Become a Pro | Priority Property Pros",
    description:
      "Independent contractors: browse local project opportunities first and pay $4.99 only when you choose to connect. One-time $9.99 account activation, then $0/month. No bid fees and no percentage of the job.",
  },
  "/faq": {
    title: "FAQ | Priority Property Pros",
    description:
      "Answers about posting projects, connecting with independent local contractors, the one-time $9.99 account activation, and the $4.99 Connection Fee on Priority Property Pros.",
  },
  "/contact": {
    title: "Contact | Priority Property Pros",
    description: "Contact Priority Property Pros support with questions about your account, a project, or a contractor connection.",
  },
  "/reviews": {
    title: "Reviews | Priority Property Pros",
    description: "Read customer reviews of independent contractors hired through Priority Property Pros, and leave a review after your project.",
  },
  "/trust": {
    title: "Trust & Safety | Priority Property Pros",
    description:
      "What Priority Property Pros is and is not: a technology marketplace connecting property owners with independent contractors. PPP is not the contractor and does not verify licenses, insurance, or workmanship.",
  },
  "/sign-up": {
    title: "Create an Account | Priority Property Pros",
    description:
      "Create a customer or contractor account on Priority Property Pros. One-time $9.99 account activation, not a monthly subscription.",
  },
  "/post-project": {
    title: "Post a Project | Priority Property Pros",
    description: "Post your home or property project on Priority Property Pros and connect with independent local contractors.",
  },
  "/sign-in": { title: "Sign In | Priority Property Pros", description: DEFAULT_DESCRIPTION, noindex: true },
  "/forgot-password": { title: "Reset Password | Priority Property Pros", description: DEFAULT_DESCRIPTION, noindex: true },
};

/** Private or utility areas that should never be indexed. */
export const NOINDEX_PREFIXES = ["/app", "/auth", "/account", "/notifications", "/dev", "/sign-in", "/login", "/forgot-password"] as const;

export function normalizePath(pathname: string): string {
  const path = (pathname || "/").split(/[?#]/)[0] || "/";
  if (path === "/") return "/";
  return path.replace(/\/+$/, "") || "/";
}

export function isNoindexPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (ROUTE_META[path]?.noindex) return true;
  return NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function canonicalUrl(pathname: string): string {
  const path = normalizePath(pathname);
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}

export type ResolvedMeta = {
  /** null when the route sets its own title (for example, a storefront page). */
  title: string | null;
  description: string;
  canonical: string;
  noindex: boolean;
};

export function metaForPath(pathname: string): ResolvedMeta {
  const path = normalizePath(pathname);
  const known = ROUTE_META[path];
  return {
    title: known ? known.title : null,
    description: known ? known.description : DEFAULT_DESCRIPTION,
    canonical: canonicalUrl(path),
    noindex: isNoindexPath(path),
  };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function replaceMetaContent(html: string, attr: "name" | "property", key: string, value: string): string {
  const pattern = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "s");
  return html.replace(pattern, (_m, start: string, end: string) => `${start}${escapeAttr(value)}${end}`);
}

/**
 * Rewrite the built index.html for one route: title, description, Open Graph,
 * Twitter, canonical, and robots. `notFound` builds the 404.html shell, which
 * GitHub Pages serves (with HTTP 404) for any path it has no file for.
 */
export function applyRouteMetaToHtml(html: string, pathname: string, options: { notFound?: boolean } = {}): string {
  const meta = metaForPath(pathname);
  const title = options.notFound ? NOT_FOUND_TITLE : (meta.title ?? DEFAULT_TITLE);
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(title)}</title>`);
  out = replaceMetaContent(out, "name", "description", meta.description);
  out = replaceMetaContent(out, "property", "og:title", title);
  out = replaceMetaContent(out, "property", "og:description", meta.description);
  out = replaceMetaContent(out, "name", "twitter:title", title);
  out = replaceMetaContent(out, "name", "twitter:description", meta.description);
  if (options.notFound) {
    // Served for unknown paths (and dynamic routes the host has no file for):
    // no fixed canonical or og:url; the app fills them in at runtime.
    out = out.replace(/\s*<link\s+rel="canonical"[^>]*>/, "");
    out = out.replace(/\s*<meta\s+property="og:url"[^>]*>/, "");
  } else {
    out = out.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${meta.canonical}$2`);
    out = replaceMetaContent(out, "property", "og:url", meta.canonical);
  }
  if (options.notFound || meta.noindex) {
    out = out.replace(/<\/title>/, `</title>\n    <meta name="robots" content="noindex" />`);
  }
  return out;
}

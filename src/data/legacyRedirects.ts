/** Old WordPress paths. SPA routes plus GitHub Pages 404.html (copy of index.html) keep the URL. */
export const LEGACY_PAGE_REDIRECTS = [
  { from: "/services", to: "/#services" },
  { from: "/about", to: "/how-it-works" },
] as const;

export function legacyRedirectTarget(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = LEGACY_PAGE_REDIRECTS.find((entry) => entry.from === normalized);
  return match?.to ?? null;
}

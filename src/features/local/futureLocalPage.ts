/** Reserved for a future local page. Not routed and not listed in the sitemap. */
export const FUTURE_LOCAL_PAGES_PUBLISHED = false;

export const FUTURE_LOCAL_ROUTE_PATTERN = "/local/:area/:trade";

export function futureLocalPath(area: string, trade: string): string | null {
  if (!FUTURE_LOCAL_PAGES_PUBLISHED) return null;
  const areaSlug = area.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const tradeSlug = trade.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!areaSlug || !tradeSlug) return null;
  return `/local/${areaSlug}/${tradeSlug}`;
}

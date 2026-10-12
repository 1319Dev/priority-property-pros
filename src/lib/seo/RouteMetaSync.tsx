import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { DEFAULT_TITLE, metaForPath } from "./routeMeta";

function setMeta(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function metaTag(attr: "name" | "property", key: string) {
  return () => {
    const el = document.createElement("meta");
    el.setAttribute(attr, key);
    return el;
  };
}

/** Write the head tags for a path. Exported for tests. */
export function applyRouteMeta(pathname: string) {
  const meta = metaForPath(pathname);
  // Layout effect: runs before page-level usePageTitle effects, so a page
  // that sets its own title (Find a Pro, a storefront) still wins.
  document.title = meta.title ?? DEFAULT_TITLE;
  setMeta('meta[name="description"]', metaTag("name", "description"), "content", meta.description);
  setMeta('meta[property="og:description"]', metaTag("property", "og:description"), "content", meta.description);
  setMeta('meta[property="og:url"]', metaTag("property", "og:url"), "content", meta.canonical);
  setMeta(
    'link[rel="canonical"]',
    () => {
      const el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      return el;
    },
    "href",
    meta.canonical,
  );
  const robots = document.head.querySelector('meta[name="robots"]');
  if (meta.noindex) {
    setMeta('meta[name="robots"]', metaTag("name", "robots"), "content", "noindex");
  } else if (robots) {
    robots.remove();
  }
}

/** Keeps title, description, canonical, og:url, and robots in sync on client-side navigation. */
export function RouteMetaSync() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    applyRouteMeta(pathname);
  }, [pathname]);
  return null;
}

import { useEffect } from "react";

/** Mark the current page noindex (for example, the not-found page). RouteMetaSync clears it on the next navigation. */
export function useNoindex() {
  useEffect(() => {
    let el = document.head.querySelector('meta[name="robots"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    el.setAttribute("content", "noindex");
  }, []);
}

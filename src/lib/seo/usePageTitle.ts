import { useEffect } from "react";

/**
 * Set a page-specific document title. RouteMetaSync resets the title on every
 * navigation, so this does not restore the previous title on unmount (doing so
 * would overwrite the next page's title).
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

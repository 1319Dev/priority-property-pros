import { useEffect, useState } from "react";

/** Matches the sidebar's lg breakpoint. Detail panes use this, not a resize listener on every pixel. */
export const ADMIN_DESKTOP_QUERY = "(min-width: 1024px)";

export function adminDesktopMatches(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(ADMIN_DESKTOP_QUERY).matches;
}

export function useAdminDesktop(): boolean {
  const [desktop, setDesktop] = useState(adminDesktopMatches);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(ADMIN_DESKTOP_QUERY);
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return desktop;
}

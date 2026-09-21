import { Navigate, useLocation } from "react-router-dom";
import { legacyRedirectTarget } from "../data/legacyRedirects";

export function LegacyPathRedirect() {
  const { pathname } = useLocation();
  const to = legacyRedirectTarget(pathname);
  if (!to) return null;
  return <Navigate to={to} replace />;
}

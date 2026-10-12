import { Navigate, useLocation } from "react-router-dom";
import { BrandLoader } from "../components/brand/BrandLoader";
import { useAuth } from "../lib/auth/useAuth";
import { roleNotificationsPath } from "../lib/auth/roles";

/** /login is a common guess for the sign-in page. Keep the query, hash, and any saved return path. */
export function LoginRedirect() {
  const location = useLocation();
  return <Navigate to={`/sign-in${location.search}${location.hash}`} state={location.state} replace />;
}

/** /app/notifications opens the signed-in role's own notifications page. */
export function AppNotificationsRedirect() {
  const { loading, user, account_type } = useAuth();
  if (loading) return <BrandLoader layout="page" label="Loading…" />;
  if (!user || !account_type) {
    return <Navigate to="/sign-in" replace state={{ from: "/app/notifications" }} />;
  }
  return <Navigate to={roleNotificationsPath(account_type)} replace />;
}

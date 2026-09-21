import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Skeleton } from "../../components/ui/Skeleton";
import { BLOCKED_STATUSES, ROLE_HOME, postLoginPath } from "./roles";
import { useAuth } from "./useAuth";
import type { AccountType } from "./types";

function AuthLoadingScreen() {
  return (
    <div className="paper-grain flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
        Priority Property Pros
      </p>
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

export function RequireAuth() {
  const { loading, user, profile, account_status, account_type, signup_fee_enabled, signup_fee_status } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoadingScreen />;
  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  if (account_status && BLOCKED_STATUSES.includes(account_status)) {
    return <Navigate to="/account/status" replace />;
  }
  if (user && !user.email_confirmed_at && !profile) {
    return <Navigate to="/auth/verify?state=check-email" replace />;
  }
  const activate = postLoginPath(account_type, account_status, {
    enabled: signup_fee_enabled,
    status: signup_fee_status,
  });
  if (activate === "/account/activate" && location.pathname !== "/account/activate") {
    return <Navigate to="/account/activate" replace />;
  }
  return <Outlet />;
}

export function RequireRole({ role }: { role: AccountType }) {
  const { loading, profile, account_type } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!account_type || !profile) {
    return <Navigate to="/sign-in" replace />;
  }
  if (account_type !== role) {
    return <Navigate to={ROLE_HOME[account_type]} replace />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  return <RequireRole role="ADMIN" />;
}

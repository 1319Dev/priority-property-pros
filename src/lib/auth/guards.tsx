import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { AdminMfaBlocked, AdminMfaChallenge } from "./AdminMfaChallenge";
import { loadAdminMfaGate, verifyAdminSignInCode, type AdminMfaGateState } from "./adminMfaApi";
import { BLOCKED_STATUSES, ROLE_HOME, postLoginPath } from "./roles";
import { useAuth } from "./useAuth";
import type { AccountType } from "./types";

function AuthLoadingScreen() {
  return (
    <div className="paper-grain flex min-h-dvh items-center justify-center">
      <BrandLoader layout="page" label="Loading…" />
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
  const { loading, profile, account_type, session } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!account_type || !profile) return <Navigate to="/sign-in" replace />;
  if (account_type !== "ADMIN") return <Navigate to={ROLE_HOME[account_type]} replace />;
  return <AdminStepUp sessionKey={session?.access_token ?? null} />;
}

/** Admin pages stay unmounted until a verified authenticator, when one exists, has been entered. */
function AdminStepUp({ sessionKey }: { sessionKey: string | null }) {
  const { signOut } = useAuth();
  const [gate, setGate] = useState<AdminMfaGateState | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancel = false;
    setGate(null);
    void loadAdminMfaGate().then((next) => {
      if (!cancel) setGate(next);
    });
    return () => {
      cancel = true;
    };
  }, [sessionKey, nonce]);

  if (!gate) return <AuthLoadingScreen />;
  if (gate.status === "allow") return <Outlet />;
  if (gate.status === "blocked") {
    return <AdminMfaBlocked onSignOut={() => void signOut()} />;
  }
  return (
    <AdminMfaChallenge
      factors={gate.factors}
      onSignOut={() => void signOut()}
      onVerify={async (factorId, code) => {
        const result = await verifyAdminSignInCode(factorId, code);
        if (!result.error) setNonce((current) => current + 1);
        return result;
      }}
    />
  );
}

import { useMemo } from "react";
import { AuthContext } from "../../src/lib/auth/AuthContext";

const ROLES = {
  customer: "CUSTOMER",
  contractor: "CONTRACTOR",
  admin: "ADMIN",
  verifier: "VERIFIER",
};

function roleFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const value = (params.get("as") || "customer").toLowerCase();
  return ROLES[value] ?? "CUSTOMER";
}

function feeFromLocation(accountType) {
  const params = new URLSearchParams(window.location.search);
  const fee = (params.get("fee") || "").toUpperCase();
  if (fee === "UNPAID" || fee === "PAID" || fee === "NOT_REQUIRED") return fee;
  return accountType === "CONTRACTOR" ? "PAID" : "NOT_REQUIRED";
}

const noop = async () => ({ error: null });

export function AuthProvider({ children }) {
  const accountType = roleFromLocation();
  const signupFeeStatus = feeFromLocation(accountType);
  const value = useMemo(() => {
    const profile = {
      id: "user-layout",
      email: "christopher.longname.homeowner@prioritypropertypros.example",
      first_name: "Christopher",
      last_name: "Homeowner",
      phone: "404-555-0199",
      avatar_url: null,
      account_type: accountType,
      account_status: "ACTIVE",
      signup_fee_status: signupFeeStatus,
      signup_fee_paid_at: signupFeeStatus === "PAID" ? "2026-03-12T15:00:00.000Z" : null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    return {
      configured: true,
      loading: false,
      user: {
        id: profile.id,
        email: profile.email,
        email_confirmed_at: "2026-01-01T00:00:00Z",
      },
      session: null,
      profile,
      account_type: accountType,
      account_status: "ACTIVE",
      signup_fee_status: signupFeeStatus,
      signup_fee_enabled: false,
      signIn: noop,
      signUp: async () => ({ error: null, needsEmailConfirm: false }),
      signOut: async () => undefined,
      refreshProfile: async () => undefined,
      requestPasswordReset: noop,
      updatePassword: noop,
      resendVerification: noop,
    };
  }, [accountType, signupFeeStatus]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

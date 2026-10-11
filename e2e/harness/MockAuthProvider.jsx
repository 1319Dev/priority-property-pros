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

function feeUnpaidFromLocation() {
  return new URLSearchParams(window.location.search).get("fee") === "unpaid";
}

const noop = async () => ({ error: null });

export function AuthProvider({ children }) {
  const accountType = roleFromLocation();
  const feeUnpaid = feeUnpaidFromLocation();
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
      signup_fee_status: feeUnpaid ? "UNPAID" : accountType === "CONTRACTOR" ? "PAID" : "NOT_REQUIRED",
      signup_fee_paid_at: feeUnpaid ? null : accountType === "CONTRACTOR" ? "2026-03-12T15:00:00.000Z" : null,
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
      signup_fee_status: feeUnpaid ? "UNPAID" : accountType === "CONTRACTOR" ? "PAID" : "NOT_REQUIRED",
      signup_fee_enabled: feeUnpaid,
      signIn: noop,
      signUp: async () => ({ error: null, needsEmailConfirm: false }),
      signOut: async () => undefined,
      refreshProfile: async () => undefined,
      requestPasswordReset: noop,
      updatePassword: noop,
      resendVerification: noop,
    };
  }, [accountType, feeUnpaid]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import type { AuthContextValue } from "./AuthContext";
import type { AccountStatus, AccountType, Profile } from "./types";

export function authValue(partial: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    configured: true,
    loading: false,
    user: null,
    session: null,
    profile: null,
    account_type: null,
    account_status: null,
    signup_fee_status: null,
    signup_fee_enabled: false,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null, needsEmailConfirm: true }),
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    requestPasswordReset: async () => ({ error: null }),
    updatePassword: async () => ({ error: null }),
    resendVerification: async () => ({ error: null }),
    ...partial,
  };
}

export function profileFor(type: AccountType, status: AccountStatus = "ACTIVE"): Profile {
  return {
    id: "user-1",
    email: "pat@example.com",
    first_name: "Pat",
    last_name: "Lee",
    phone: null,
    avatar_url: null,
    account_type: type,
    account_status: status,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

export function signedInAuth(type: AccountType, partial: Partial<AuthContextValue> = {}): AuthContextValue {
  return authValue({
    user: { id: "user-1", email: "pat@example.com" } as AuthContextValue["user"],
    profile: profileFor(type),
    account_type: type,
    account_status: "ACTIVE",
    ...partial,
  });
}

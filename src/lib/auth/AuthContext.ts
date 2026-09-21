import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { AccountStatus, AccountType, Profile, SignUpInput } from "./types";
import type { SignupFeeStatus } from "../signupFee/constants";

export type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  account_type: AccountType | null;
  account_status: AccountStatus | null;
  signup_fee_status: SignupFeeStatus | null;
  signup_fee_enabled: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (input: SignUpInput) => Promise<{ error: string | null; needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

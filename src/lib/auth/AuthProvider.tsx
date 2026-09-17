import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "../supabase/client";
import { AUTH_CALLBACK_PATH, AUTH_RESET_PATH, authRedirectUrl } from "./redirects";
import { AuthContext } from "./AuthContext";
import { buildSignupMetadata } from "./signupMetadata";
import type { Profile, SignUpInput } from "./types";

async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, first_name, last_name, phone, avatar_url, account_type, account_status, signup_fee_status, signup_fee_paid_at, created_at, updated_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("Failed to load profile", error.message);
    return null;
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);
    setUser(next?.user ?? null);
    if (next?.user) {
      setProfile(await fetchProfile(next.user.id));
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      await applySession(data.session);
      if (!cancelled) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [applySession]);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    setProfile(await fetchProfile(user.id));
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: "Supabase is not configured yet." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: "Supabase is not configured yet.", needsEmailConfirm: false };
    if (!input.acceptedTerms) {
      return { error: "You must accept the Terms of Use and Privacy Policy.", needsEmailConfirm: false };
    }
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: authRedirectUrl(AUTH_CALLBACK_PATH),
        data: buildSignupMetadata(input),
      },
    });
    const needsEmailConfirm = Boolean(data.user) && !data.session;
    return { error: error?.message ?? null, needsEmailConfirm };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: "Supabase is not configured yet." };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl(AUTH_RESET_PATH),
    });
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: "Supabase is not configured yet." };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: "Supabase is not configured yet." };
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl(AUTH_CALLBACK_PATH) },
    });
    return { error: error?.message ?? null };
  }, []);

  const value = useMemo(
    () => ({
      configured,
      loading,
      user,
      session,
      profile,
      account_type: profile?.account_type ?? null,
      account_status: profile?.account_status ?? null,
      signup_fee_status: profile?.signup_fee_status ?? null,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      requestPasswordReset,
      updatePassword,
      resendVerification,
    }),
    [
      configured,
      loading,
      user,
      session,
      profile,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      requestPasswordReset,
      updatePassword,
      resendVerification,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

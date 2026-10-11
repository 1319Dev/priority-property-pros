import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Input";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import {
  DIFFERENT_BROWSER_RESET_MESSAGE,
  establishRecoverySession,
  expiredResetMessage,
  getRecoveryLinkSnapshot,
  passwordResetRequestMessage,
  stripRecoveryCredentialsFromLocation,
  type RecoveryEstablishResult,
  type RecoveryLink,
} from "../lib/auth/recoveryLink";
import { passwordPolicyError } from "../lib/auth/passwordPolicy";
import { postLoginPath } from "../lib/auth/roles";
import { useAuth } from "../lib/auth/useAuth";
import { getSupabaseClient } from "../lib/supabase/client";

type RecoveryOutcome = { status: "checking" } | RecoveryEstablishResult;

function initialRecoveryOutcome(): RecoveryOutcome {
  const link = getRecoveryLinkSnapshot();
  if (link.kind === "error") {
    return { status: "expired", message: expiredResetMessage(link.description ?? link.code) };
  }
  return { status: "checking" };
}

export function ResetPasswordPage() {
  const {
    updatePassword,
    configured,
    account_type,
    account_status,
    signup_fee_enabled,
    signup_fee_status,
    user,
    loading,
    requestPasswordReset,
  } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RecoveryOutcome>(initialRecoveryOutcome);
  const [email, setEmail] = useState("");
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    const link = getRecoveryLinkSnapshot();
    const supabase = getSupabaseClient();
    let cancelled = false;
    const stripOnSuccess = link.kind === "code" || link.kind === "tokens" || link.kind === "token_hash";

    const markReady = () => {
      if (cancelled) return;
      readyRef.current = true;
      setOutcome({ status: "ready" });
      if (stripOnSuccess) stripRecoveryCredentialsFromLocation();
    };

    const markExpired = (message: string) => {
      if (cancelled || readyRef.current) return;
      setOutcome({ status: "expired", message });
    };

    if (link.kind === "error") {
      markExpired(expiredResetMessage(link.description ?? link.code));
      return () => {
        cancelled = true;
      };
    }

    let unsubscribe = () => {};
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
          markReady();
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }

    if (!supabase || link.kind === "none") {
      if (!supabase && link.kind !== "none") markExpired(expiredResetMessage(null));
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    void establishRecoverySession(
      {
        getSession: () => supabase.auth.getSession(),
        setSession: (tokens) => supabase.auth.setSession(tokens),
        verifyOtp: (params) => supabase.auth.verifyOtp(params),
        exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
      },
      link,
    ).then((result) => {
      if (result.status === "ready") markReady();
      else markExpired(result.message);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const link: RecoveryLink = getRecoveryLinkSnapshot();
    if (link.kind !== "none" || loading) return;
    if (user || readyRef.current) {
      readyRef.current = true;
      setOutcome({ status: "ready" });
      return;
    }
    setOutcome({ status: "expired", message: expiredResetMessage(null) });
  }, [loading, user]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const tooShort = passwordPolicyError(password);
    if (tooShort) {
      setError(tooShort);
      return;
    }
    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(postLoginPath(account_type, account_status, { enabled: signup_fee_enabled, status: signup_fee_status }), { replace: true });
  }

  async function onRequestNew(event: FormEvent) {
    event.preventDefault();
    setResendError(null);
    setResendBusy(true);
    const result = await requestPasswordReset(email);
    setResendBusy(false);
    const message = passwordResetRequestMessage(result);
    if (message) {
      setResendError(message);
      return;
    }
    setResendSent(true);
  }

  const recovery = getRecoveryLinkSnapshot();
  const linkReady = outcome.status === "ready" || (recovery.kind === "none" && user != null && outcome.status !== "expired");
  const showForm = linkReady && !loading;
  const showExpired = outcome.status === "expired" && !loading && !showForm;
  const showChecking = !showForm && !showExpired;

  return (
    <AuthCard
      eyebrow="Password"
      title="Choose a new password."
      footer={
        <Link to="/sign-in" className="font-semibold text-forest-800 underline">
          Sign in instead
        </Link>
      }
    >
      {showChecking ? (
        <p className="text-sm text-ink-700">Checking your reset link…</p>
      ) : showExpired ? (
        <>
          <p className="text-sm text-ink-700">
            {outcome.status === "expired" ? outcome.message : DIFFERENT_BROWSER_RESET_MESSAGE}
          </p>
          {resendSent ? (
            <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
              If that email has an account, a reset link is on the way. Check spam too.
            </p>
          ) : (
            <form className="space-y-4" onSubmit={onRequestNew}>
              <TextInput
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <FormError message={resendError} />
              <Button type="submit" disabled={resendBusy || !configured}>
                {resendBusy ? "Sending…" : "Send a new link"}
              </Button>
            </form>
          )}
        </>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <TextInput
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FormError message={error} />
          <Button type="submit" disabled={busy || !configured}>
            {busy ? "Saving…" : "Save password"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

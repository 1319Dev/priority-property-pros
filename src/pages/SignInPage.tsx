import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { BrandLoader } from "../components/brand/BrandLoader";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Input";
import { dashboardPath } from "../lib/auth/publicEntry";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import { safeReturnPath } from "../lib/auth/sessionReturn";
import { signInFieldErrors } from "../lib/auth/signInError";
import { useAuth } from "../lib/auth/useAuth";
import { SIGN_IN_CREATE_ACCOUNT_NOTE } from "../data/pricing";

const SESSION_EXPIRED_MESSAGE = "Your session expired. Sign in to continue. You'll come back to the page you were on.";

export function SignInPage() {
  const { signIn, configured, refreshProfile, account_type, account_status, signup_fee_enabled, signup_fee_status, user, loading, sessionNotice } =
    useAuth();
  const location = useLocation();
  const state = location.state as { from?: unknown; notice?: string } | null;
  const from = safeReturnPath(state?.from);
  const expired = state?.notice === "expired" || sessionNotice === "expired";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  if (loading) return <BrandLoader layout="page" label="Loading…" />;
  if (user && account_type) {
    const next =
      from ||
      dashboardPath({
        accountType: account_type,
        accountStatus: account_status,
        signupFeeEnabled: signup_fee_enabled,
        signupFeeStatus: signup_fee_status,
      });
    return <Navigate to={next} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const nextErrors = signInFieldErrors(email, password);
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      const first = nextErrors.email ? "email" : "password";
      event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setBusy(true);
    const result = await signIn(email, password);
    if (result.error) {
      setBusy(false);
      setError(result.error);
      return;
    }
    await refreshProfile();
    setBusy(false);
  }

  return (
    <AuthCard
      eyebrow="Sign in"
      title="Welcome back."
      footer={
        <>
          New here?{" "}
          <Link to="/sign-up" className="font-semibold text-forest-800 underline">
            Create an account
          </Link>
          . {SIGN_IN_CREATE_ACCOUNT_NOTE}
        </>
      }
    >
      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        {expired ? (
          <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700" role="status">
            {SESSION_EXPIRED_MESSAGE}
          </p>
        ) : null}
        <TextInput
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          aria-required="true"
          value={email}
          error={fieldErrors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((current) => ({ ...current, email: undefined }));
          }}
        />
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-required="true"
          value={password}
          error={fieldErrors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
        />
        <p className="text-sm">
          <Link to="/forgot-password" className="font-semibold text-forest-800 underline">
            Forgot password?
          </Link>
        </p>
        <FormError message={error} />
        <Button type="submit" disabled={busy || !configured}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}

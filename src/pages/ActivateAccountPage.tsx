import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import { postLoginPath } from "../lib/auth/roles";
import { useAuth } from "../lib/auth/useAuth";
import { confirmSignupFeeSession, startSignupFeeCheckout } from "../lib/signupFee/api";
import { CUSTOMER_SIGNUP_FEE_SENTENCE, CONTRACTOR_SIGNUP_FEE_SENTENCE } from "../data/pricing";
import { needsSignupFeePayment } from "../lib/signupFee/policy";

export function ActivateAccountPage() {
  const { user, profile, account_type, account_status, signup_fee_status, refreshProfile, loading, signOut } =
    useAuth();
  const [params] = useSearchParams();
  const state = params.get("state");
  const sessionId = params.get("session_id");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(state === "return");

  const unpaid = needsSignupFeePayment(account_type ?? profile?.account_type, signup_fee_status ?? profile?.signup_fee_status);

  useEffect(() => {
    if (state !== "return") return;
    let cancelled = false;
    void (async () => {
      setConfirming(true);
      try {
        await confirmSignupFeeSession(sessionId);
        await refreshProfile();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not confirm payment.");
      } finally {
        if (!cancelled) setConfirming(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, sessionId, refreshProfile]);

  if (!loading && user && !unpaid) {
    return <Navigate to={postLoginPath(account_type, account_status, signup_fee_status)} replace />;
  }

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      const result = await startSignupFeeCheckout();
      if (result.already_paid) {
        await refreshProfile();
        return;
      }
      if (result.checkout_url) {
        window.location.assign(result.checkout_url);
        return;
      }
      setError("Could not start the $9.99 signup payment.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the $9.99 signup payment.");
    } finally {
      setBusy(false);
    }
  }

  const feeCopy =
    (account_type ?? profile?.account_type) === "CONTRACTOR"
      ? CONTRACTOR_SIGNUP_FEE_SENTENCE
      : CUSTOMER_SIGNUP_FEE_SENTENCE;

  return (
    <AuthCard eyebrow="Activate account" title="Pay $9.99 to activate your account.">
      <p className="text-ink-700">{feeCopy}</p>
      <p className="text-sm text-ink-700">
        This is a one-time account signup fee. It does not approve contractors, enable job payments, or turn on
        Stripe Connect. Returning from checkout does not mark you paid by itself — only a confirmed Stripe payment
        does.
      </p>
      {state === "cancel" ? (
        <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          Checkout was cancelled. Your account is still unpaid.
        </p>
      ) : null}
      {confirming ? (
        <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">Confirming payment with Stripe…</p>
      ) : null}
      <FormError message={error} />
      <Button type="button" disabled={busy || confirming || !user} onClick={() => void pay()}>
        {busy ? "Starting checkout…" : "Pay $9.99"}
      </Button>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
        <Link to="/" className="inline-flex min-h-12 items-center font-semibold text-forest-800 underline">
          Back home
        </Link>
      </div>
    </AuthCard>
  );
}
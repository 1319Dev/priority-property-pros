import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import { postLoginPath } from "../lib/auth/roles";
import { useAuth } from "../lib/auth/useAuth";
import { reconcileSignupFeeCheckout, startSignupFeeCheckout } from "../lib/signupFee/api";
import { CONTRACTOR_SIGNUP_LEDE, CUSTOMER_SIGNUP_LEDE, SIGNUP_FEE_NON_REFUNDABLE } from "../data/pricing";
import { needsSignupFeePayment } from "../lib/signupFee/policy";

export function ActivateAccountPage() {
  const {
    user,
    profile,
    account_type,
    account_status,
    signup_fee_status,
    signup_fee_enabled,
    refreshProfile,
    loading,
    signOut,
  } = useAuth();
  const [params] = useSearchParams();
  const state = params.get("state");
  const sessionId = params.get("session_id");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(state === "return");

  const unpaid = needsSignupFeePayment({
    enabled: signup_fee_enabled,
    accountType: account_type ?? profile?.account_type,
    status: signup_fee_status ?? profile?.signup_fee_status,
  });

  useEffect(() => {
    if (state !== "return") {
      setConfirming(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setConfirming(true);
      try {
        if (sessionId) await reconcileSignupFeeCheckout(sessionId);
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

  if (loading) {
    return (
      <AuthCard eyebrow="Activate account" title="Checking your account…">
        <p className="text-ink-700">One moment.</p>
      </AuthCard>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!unpaid) {
    return <Navigate to={postLoginPath(account_type, account_status)} replace />;
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
      setError("Could not start the $9.99 activation payment.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the $9.99 activation payment.");
    } finally {
      setBusy(false);
    }
  }

  const feeCopy =
    (account_type ?? profile?.account_type) === "CONTRACTOR" ? CONTRACTOR_SIGNUP_LEDE : CUSTOMER_SIGNUP_LEDE;

  return (
    <AuthCard eyebrow="Activate account" title="Pay $9.99 to activate your account.">
      <p className="text-ink-700">{feeCopy}</p>
      <p className="text-sm text-ink-700">
        This is a one-time account activation. It does not approve contractors, unlock project contact, enable job
        payments, or turn on Stripe Connect. Returning from checkout does not mark you paid by itself — only a
        confirmed Stripe payment does. {SIGNUP_FEE_NON_REFUNDABLE}
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

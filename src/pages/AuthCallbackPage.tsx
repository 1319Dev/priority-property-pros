import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLoader } from "../components/brand/BrandLoader";
import { getSupabaseClient } from "../lib/supabase/client";
import { AuthCard } from "../lib/auth/AuthCard";
import { emailOtpType } from "../lib/auth/recoveryLink";
import { postLoginPath } from "../lib/auth/roles";
import { useAuth } from "../lib/auth/useAuth";

export function AuthCallbackPage() {
  const { refreshProfile, account_type, account_status, signup_fee_enabled, signup_fee_status, loading, user } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setFailed(true);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = params.get("code");
    const tokenHash = params.get("token_hash") ?? hashParams.get("token_hash");
    const otpType = emailOtpType(params.get("type") ?? hashParams.get("type"));
    const errorDescription = params.get("error_description") ?? params.get("error");
    if (errorDescription) {
      setFailed(true);
      return;
    }

    void (async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setFailed(true);
          return;
        }
      } else if (tokenHash) {
        if (!otpType) {
          setFailed(true);
          return;
        }
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
        if (error) {
          setFailed(true);
          return;
        }
      }
      await refreshProfile();
    })();
  }, [refreshProfile]);

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate(postLoginPath(account_type, account_status, { enabled: signup_fee_enabled, status: signup_fee_status }), { replace: true });
    }
  }, [loading, user, account_type, account_status, signup_fee_enabled, signup_fee_status, navigate]);

  if (failed) {
    return (
      <AuthCard eyebrow="Auth" title="That link did not work.">
        <p className="text-ink-700">
          The sign-in or verification link expired.{" "}
          <Link to="/auth/verify?state=failed" className="font-semibold text-forest-800 underline">
            Try again
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  return <BrandLoader layout="page" label="Finishing sign-in…" />;
}

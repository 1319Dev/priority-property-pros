import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSupabaseClient } from "../lib/supabase/client";
import { AuthCard } from "../lib/auth/AuthCard";
import { postLoginPath } from "../lib/auth/roles";
import { useAuth } from "../lib/auth/useAuth";

export function AuthCallbackPage() {
  const { refreshProfile, account_type, account_status, loading, user } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setFailed(true);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
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
      }
      await refreshProfile();
    })();
  }, [refreshProfile]);

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate(postLoginPath(account_type, account_status), { replace: true });
    }
  }, [loading, user, account_type, account_status, navigate]);

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

  return (
    <AuthCard eyebrow="Auth" title="Finishing sign-in…">
      <p className="text-ink-700">One moment while we confirm your session.</p>
    </AuthCard>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Input";
import { postLoginPath } from "../lib/auth/roles";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import { useAuth } from "../lib/auth/useAuth";

export function SignInPage() {
  const { signIn, configured, refreshProfile, account_type, account_status, signup_fee_status, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user && account_type) {
      const dest = postLoginPath(account_type, account_status, signup_fee_status);
      navigate(dest === "/account/activate" ? dest : from || dest, { replace: true });
    }
  }, [loading, user, account_type, account_status, signup_fee_status, from, navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
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
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <TextInput
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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

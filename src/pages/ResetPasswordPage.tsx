import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Input";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import { postLoginPath } from "../lib/auth/roles";
import { useAuth } from "../lib/auth/useAuth";

export function ResetPasswordPage() {
  const { updatePassword, configured, account_type, account_status, user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(postLoginPath(account_type, account_status), { replace: true });
  }

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
      {loading ? (
        <p className="text-sm text-ink-700">Checking your reset link…</p>
      ) : !user ? (
        <p className="text-sm text-ink-700">
          This reset link is missing or expired. Request a new one from{" "}
          <Link to="/forgot-password" className="font-semibold text-forest-800 underline">
            forgot password
          </Link>
          .
        </p>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <TextInput
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Input";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import { useAuth } from "../lib/auth/useAuth";

export function ForgotPasswordPage() {
  const { requestPasswordReset, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <AuthCard
      eyebrow="Password"
      title="Reset your password."
      footer={
        <Link to="/sign-in" className="font-semibold text-forest-800 underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          If that email has an account, a reset link is on the way. Check spam too.
        </p>
      ) : (
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
          <FormError message={error} />
          <Button type="submit" disabled={busy || !configured}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Input";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import { useAuth } from "../lib/auth/useAuth";

const copy = {
  "check-email": {
    title: "Check your email.",
    body: "We sent a verification link. Open it on this device if you can, then come back to sign in.",
  },
  verified: {
    title: "Email verified.",
    body: "Your email is confirmed. You can sign in and open your dashboard.",
  },
  failed: {
    title: "Verification failed.",
    body: "That link is invalid or expired. Request a new one below.",
  },
  resend: {
    title: "Resend verification.",
    body: "Enter the email you used to sign up.",
  },
} as const;

type VerifyState = keyof typeof copy;

function parseState(value: string | null): VerifyState {
  if (value && value in copy) return value as VerifyState;
  return "check-email";
}

export function VerifyEmailPage() {
  const { resendVerification, configured, user } = useAuth();
  const [params] = useSearchParams();
  const state = parseState(params.get("state"));
  const presetEmail = params.get("email") ?? user?.email ?? "";
  const [email, setEmail] = useState(presetEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const view = copy[state];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await resendVerification(email);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <AuthCard
      eyebrow="Email"
      title={view.title}
      footer={
        <Link to="/sign-in" className="font-semibold text-forest-800 underline">
          Go to sign in
        </Link>
      }
    >
      <p className="text-ink-700">{view.body}</p>
      {state === "verified" ? (
        <Link
          to="/sign-in"
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-forest-800 px-5 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-cream-50"
        >
          Sign in
        </Link>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <TextInput
            label="Email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FormError message={error} />
          {sent ? (
            <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm">A new link is on the way if the account exists.</p>
          ) : null}
          <Button type="submit" disabled={busy || !configured}>
            {busy ? "Sending…" : "Resend verification email"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

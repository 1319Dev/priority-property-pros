import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/Input";
import { AuthCard, FormError } from "./AuthCard";
import { digitsOnly } from "./adminMfa";

export function AdminMfaChallenge({
  factors,
  onVerify,
  onSignOut,
}: {
  factors: { id: string; friendlyName: string }[];
  onVerify: (factorId: string, code: string) => Promise<{ error: string | null }>;
  onSignOut: () => void;
}) {
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = factors.find((factor) => factor.id === factorId) ?? factors[0];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    const result = await onVerify(selected.id, digitsOnly(code));
    setBusy(false);
    if (result.error) {
      setError(result.error);
      setCode("");
    }
  }

  return (
    <AuthCard
      eyebrow="Admin"
      title="Enter your authenticator code."
      lede="This admin account has an authenticator. Enter the 6-digit code before any admin page opens. This is the same step after a password reset."
    >
      {factors.length === 0 ? (
        <>
          <p className="text-sm text-ink-700">
            No authenticator is ready on this session. Sign out and try again.
          </p>
          <Button type="button" variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        </>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
          {factors.length > 1 ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
                Authenticator
              </span>
              <select
                className="min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 text-base text-ink-900"
                value={selected?.id ?? ""}
                onChange={(event) => setFactorId(event.target.value)}
              >
                {factors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendlyName}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-ink-700">Code from {selected?.friendlyName}.</p>
          )}
          <TextInput
            label="6-digit code"
            name="admin-mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(digitsOnly(event.target.value).slice(0, 6))}
          />
          <FormError message={error} />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || digitsOnly(code).length !== 6}>
              {busy ? "Checking…" : "Verify"}
            </Button>
            <Button type="button" variant="outline" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}

export function AdminMfaBlocked({ onSignOut }: { onSignOut: () => void }) {
  return (
    <AuthCard
      eyebrow="Admin"
      title="Two-factor sign-in is required."
      lede="Admin access is set to require an authenticator, and this session is not signed in with one."
    >
      <p className="text-sm text-ink-700">
        Sign out, then enroll an authenticator from admin settings after the requirement is turned off. If you
        are locked out, the project owner can set platform_settings.admin_mfa_required back to 0.
      </p>
      <Button type="button" variant="outline" onClick={onSignOut}>
        Sign out
      </Button>
    </AuthCard>
  );
}

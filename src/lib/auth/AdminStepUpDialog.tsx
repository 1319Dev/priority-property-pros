import { useEffect, useState, type FormEvent } from "react";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { Button } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/Input";
import { FormError } from "./AuthCard";
import { ADMIN_STEP_UP_MAX_MINUTES, ADMIN_STEP_UP_MESSAGE, digitsOnly } from "./adminMfa";
import { challengeAndVerifyTotp, listAdminTotpFactors, type AdminTotpFactor } from "./adminMfaApi";
import { registerAdminStepUpHandler } from "./adminStepUp";

/**
 * Mounted once in the admin shell. Sensitive RPCs call it when the database
 * asks for a fresh authenticator code. It stays closed while that check is off.
 */
export function AdminStepUpHost() {
  const [pending, setPending] = useState<((ok: boolean) => void) | null>(null);
  const [factors, setFactors] = useState<AdminTotpFactor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    registerAdminStepUpHandler(
      () =>
        new Promise<boolean>((resolve) => {
          setCode("");
          setError(null);
          setPending(() => resolve);
        }),
    );
    return () => registerAdminStepUpHandler(null);
  }, []);

  useEffect(() => {
    if (!pending) return undefined;
    let cancelled = false;
    void listAdminTotpFactors().then((listed) => {
      if (cancelled) return;
      const verified = listed.factors.filter((factor) => factor.status === "verified");
      setFactors(verified);
      setFactorId(verified[0]?.id ?? "");
      if (listed.error) setError(listed.error);
    });
    return () => {
      cancelled = true;
    };
  }, [pending]);

  function finish(ok: boolean) {
    const resolve = pending;
    setPending(null);
    setBusy(false);
    resolve?.(ok);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const selected = factors.find((factor) => factor.id === factorId) ?? factors[0];
    if (!selected) return;
    setBusy(true);
    setError(null);
    const result = await challengeAndVerifyTotp(selected.id, code);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      setCode("");
      return;
    }
    finish(true);
  }

  const selected = factors.find((factor) => factor.id === factorId) ?? factors[0];

  return (
    <BottomSheet open={pending !== null} title="Confirm this admin action" onClose={() => finish(false)}>
      <p className="text-sm leading-relaxed text-ink-700">{ADMIN_STEP_UP_MESSAGE}</p>
      <form className="mt-4 space-y-4" onSubmit={(event) => void onSubmit(event)}>
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
          <p className="text-sm text-ink-700">
            {selected ? `Code from ${selected.friendlyName}.` : "No verified authenticator is on this account."}
          </p>
        )}
        <TextInput
          label="6-digit code"
          name="admin-step-up-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(digitsOnly(event.target.value).slice(0, 6))}
        />
        <p className="text-sm text-ink-500">
          A backup authenticator works here too. The code has to be from the last {ADMIN_STEP_UP_MAX_MINUTES} minutes.
        </p>
        <FormError message={error} />
        <div className="flex flex-col gap-2">
          <Button type="submit" className="min-h-14 w-full" disabled={busy || !selected || digitsOnly(code).length !== 6}>
            {busy ? "Checking…" : "Verify and continue"}
          </Button>
          <Button type="button" variant="ghost" className="min-h-12 w-full" disabled={busy} onClick={() => finish(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/Input";
import { FormError } from "../../../lib/auth/AuthCard";
import {
  canUnenrollVerifiedFactor,
  digitsOnly,
} from "../../../lib/auth/adminMfa";
import {
  challengeAndVerifyTotp,
  discardAdminFactor,
  enrollAdminTotp,
  loadAdminMfaSnapshot,
  removeAdminFactor,
  type AdminMfaSnapshot,
  type AdminTotpFactor,
} from "../../../lib/auth/adminMfaApi";

type PendingEnroll = {
  factorId: string;
  qrSrc: string;
  secret: string;
  friendlyName: string;
};

export function AdminTwoFactorPage() {
  const [snapshot, setSnapshot] = useState<AdminMfaSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [pending, setPending] = useState<PendingEnroll | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const pendingId = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const next = await loadAdminMfaSnapshot();
    setSnapshot(next);
    setLoadError(next.error);
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      const id = pendingId.current;
      if (!id) return;
      pendingId.current = null;
      void discardAdminFactor(id);
    };
  }, [reload]);

  const verified = snapshot?.factors.filter((factor) => factor.status === "verified") ?? [];
  const removal = canUnenrollVerifiedFactor({
    currentLevel: snapshot?.currentLevel ?? null,
    verifiedCount: verified.length,
    mfaRequired: snapshot?.mfaRequired === true,
  });

  async function onEnroll(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await enrollAdminTotp(deviceName);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    pendingId.current = result.factorId;
    setPending({ ...result, friendlyName: deviceName.trim() });
    setCode("");
  }

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError(null);
    const result = await challengeAndVerifyTotp(pending.factorId, code);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      setCode("");
      return;
    }
    pendingId.current = null;
    setPending(null);
    setDeviceName("");
    setCode("");
    setNotice(`${pending.friendlyName} is ready. Add a second authenticator if you only have one.`);
    await reload();
  }

  function onCancelEnroll() {
    const id = pendingId.current;
    pendingId.current = null;
    setPending(null);
    setCode("");
    setError(null);
    if (id) void discardAdminFactor(id).then(() => reload());
  }

  async function onRemove(factor: AdminTotpFactor) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await removeAdminFactor(factor.id);
    setBusy(false);
    setConfirmRemoveId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(`${factor.friendlyName} was removed.`);
    await reload();
  }

  async function copySecret() {
    if (!pending) return;
    try {
      await navigator.clipboard.writeText(pending.secret);
      setNotice("Secret copied. Paste it into your authenticator, then enter the code.");
    } catch {
      setNotice("Select the secret and copy it into your authenticator.");
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Two-factor sign-in</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">
          Sign-in codes come from an authenticator app on a device you keep. Supabase does not issue recovery
          codes for these. A second device is the backup.
        </p>
      </header>

      {verified.length < 2 ? (
        <aside className="rounded-3xl border border-gold-500/50 bg-cream-100 px-5 py-4 text-sm leading-relaxed text-ink-700">
          <p className="font-semibold text-forest-800">Add a backup authenticator.</p>
          <p className="mt-2">
            Enroll a second device, such as another phone or a password manager that stores authenticator codes.
            If you lose every device after this requirement is turned on, the project owner has to turn it off in
            the database before you can sign in to admin again.
          </p>
        </aside>
      ) : (
        <p className="text-sm text-ink-700">Two authenticators are enrolled. Either one can sign you in.</p>
      )}

      <FormError message={error ?? loadError} />
      {notice ? <p className="text-sm text-forest-800">{notice}</p> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gold-700">Enrolled devices</h2>
        {snapshot && snapshot.factors.length === 0 ? (
          <p className="text-sm text-ink-700">No authenticator yet.</p>
        ) : null}
        <ul className="space-y-3">
          {snapshot?.factors.map((factor) => {
            const verifiedFactor = factor.status === "verified";
            const removeAllowed = !verifiedFactor || removal.allowed;
            return (
              <li key={factor.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
                <p className="font-semibold text-forest-800">{factor.friendlyName}</p>
                <p className="mt-1 text-sm text-ink-500">
                  {verifiedFactor ? "Verified authenticator" : "Setup not finished"}
                </p>
                {confirmRemoveId === factor.id ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void onRemove(factor)}>
                      {busy ? "Removing…" : "Confirm removal"}
                    </Button>
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmRemoveId(null)}>
                      Keep it
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    className="mt-3"
                    variant="outline"
                    size="sm"
                    disabled={busy || !removeAllowed}
                    onClick={() => setConfirmRemoveId(factor.id)}
                  >
                    {verifiedFactor ? "Remove" : "Discard unfinished setup"}
                  </Button>
                )}
                {verifiedFactor && !removal.allowed && removal.reason ? (
                  <p className="mt-2 text-sm text-ink-500">{removal.reason}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {pending ? (
        <form className="space-y-4 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4" onSubmit={(event) => void onConfirm(event)}>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gold-700">
            Confirm {pending.friendlyName}
          </h2>
          <img src={pending.qrSrc} alt="Authenticator QR code" className="h-48 w-48 bg-white p-2" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Manual entry secret</p>
            <input
              readOnly
              aria-label="Authenticator secret"
              value={pending.secret}
              className="mt-2 w-full break-all rounded-2xl border border-forest-800/15 bg-cream-100 px-4 py-3 font-mono text-sm text-ink-900"
            />
            <button type="button" className="mt-2 text-sm font-semibold text-forest-800 underline" onClick={() => void copySecret()}>
              Copy secret
            </button>
          </div>
          <TextInput
            label="6-digit code"
            name="enroll-mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(digitsOnly(event.target.value).slice(0, 6))}
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || digitsOnly(code).length !== 6}>
              {busy ? "Checking…" : "Verify and save"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onCancelEnroll}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void onEnroll(event)}>
          <TextInput
            label="Device name"
            name="device-name"
            value={deviceName}
            maxLength={64}
            hint="For example, Phone or Backup tablet."
            onChange={(event) => setDeviceName(event.target.value)}
          />
          <Button type="submit" disabled={busy || deviceName.trim().length === 0}>
            {busy ? "Starting…" : "Set up authenticator"}
          </Button>
        </form>
      )}
    </div>
  );
}

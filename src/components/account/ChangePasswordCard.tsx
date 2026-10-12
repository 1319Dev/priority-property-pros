import { useState, type FormEvent } from "react";
import { FormError } from "../../lib/auth/AuthCard";
import { changePassword, PASSWORD_CHANGE_MIN_LENGTH, type PasswordChangeDeps } from "../../lib/auth/passwordChange";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/Input";

export function ChangePasswordCard({ email, deps }: { email: string | null | undefined; deps?: PasswordChangeDeps }) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await changePassword({ email, currentPassword, newPassword, confirmPassword }, deps);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    reset();
    setOpen(false);
    setDone(true);
  }

  return (
    <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-5" aria-labelledby="change-password-heading">
      <h2 id="change-password-heading" className="font-display text-2xl text-forest-800">
        Password
      </h2>
      {done ? (
        <p className="mt-2 text-sm font-semibold text-forest-800" role="status">
          Your password was changed.
        </p>
      ) : null}
      {!open ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
        >
          Change password
        </Button>
      ) : (
        <form className="mt-3 space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
          <p className="text-sm text-ink-700">Enter your current password first. New passwords need at least {PASSWORD_CHANGE_MIN_LENGTH} characters.</p>
          <TextInput
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <TextInput
            label="New password"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_CHANGE_MIN_LENGTH}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <TextInput
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <FormError message={error} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

import { useState } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/Input";
import {
  DELETE_ACCOUNT_BODY,
  DELETE_ACCOUNT_CONFIRM_HINT,
  DELETE_ACCOUNT_CONFIRM_WORD,
  DELETE_ACCOUNT_DELETED_STATUS,
  DELETE_ACCOUNT_DELETING_STATUS,
  DELETE_ACCOUNT_TITLE,
  deleteAccountConfirmEnabled,
} from "../../lib/auth/deleteAccount";

export function DeleteAccountDialog({
  open,
  busy = false,
  deleted = false,
  error = null,
  onConfirm,
  onClose,
  onFinished,
}: {
  open: boolean;
  busy?: boolean;
  deleted?: boolean;
  error?: string | null;
  onConfirm: (password: string) => void;
  onClose: () => void;
  onFinished?: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const canConfirm = deleteAccountConfirmEnabled(typed, password);

  return (
    <BottomSheet
      open={open}
      title={deleted ? "Account deleted" : DELETE_ACCOUNT_TITLE}
      onClose={() => {
        if (busy) return;
        setTyped("");
        setPassword("");
        onClose();
      }}
    >
      {deleted ? (
        <>
          <p className="text-sm leading-relaxed text-ink-700" role="status">
            {DELETE_ACCOUNT_DELETED_STATUS}
          </p>
          <div className="mt-5">
            <Button type="button" className="min-h-14 w-full" onClick={() => onFinished?.()}>
              Done
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ink-700">{DELETE_ACCOUNT_BODY}</p>
          <div className="mt-4 space-y-3">
            <TextInput
              label="Current password"
              hint="Re-enter the password for this account."
              name="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
            <TextInput
              label={`Type ${DELETE_ACCOUNT_CONFIRM_WORD}`}
              hint={DELETE_ACCOUNT_CONFIRM_HINT}
              name="delete-account-confirm"
              autoComplete="off"
              value={typed}
              disabled={busy}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
          {busy ? (
            <p className="mt-3 text-sm text-ink-700" role="status">
              {DELETE_ACCOUNT_DELETING_STATUS}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-2xl bg-danger-600/10 px-4 py-3 text-sm text-danger-600" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col gap-2">
            <Button
              type="button"
              className="min-h-14 w-full"
              variant="outline"
              disabled={busy || !canConfirm}
              onClick={() => onConfirm(password)}
            >
              {busy ? "Deleting…" : "Delete my account"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 w-full"
              disabled={busy}
              onClick={() => {
                setTyped("");
                setPassword("");
                onClose();
              }}
            >
              Keep my account
            </Button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

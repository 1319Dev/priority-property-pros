import { useState } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/Input";
import {
  DELETE_ACCOUNT_BODY,
  DELETE_ACCOUNT_CONFIRM_HINT,
  DELETE_ACCOUNT_CONFIRM_WORD,
  DELETE_ACCOUNT_TITLE,
  deleteAccountConfirmEnabled,
} from "../../lib/auth/deleteAccount";

export function DeleteAccountDialog({
  open,
  busy = false,
  error = null,
  onConfirm,
  onClose,
}: {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const canConfirm = deleteAccountConfirmEnabled(typed);

  return (
    <BottomSheet
      open={open}
      title={DELETE_ACCOUNT_TITLE}
      onClose={() => {
        if (busy) return;
        setTyped("");
        onClose();
      }}
    >
      <p className="text-sm leading-relaxed text-ink-700">{DELETE_ACCOUNT_BODY}</p>
      <div className="mt-4">
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
          onClick={onConfirm}
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
            onClose();
          }}
        >
          Keep my account
        </Button>
      </div>
    </BottomSheet>
  );
}

import type { ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Keep it",
  tone = "danger",
  busy = false,
  notice,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  /** Optional short line shown directly above the confirm button. */
  notice?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-ink-700">{body}</p>
      {notice ? <div className="mt-4">{notice}</div> : null}
      <div className={notice ? "mt-3 flex flex-col gap-2" : "mt-5 flex flex-col gap-2"}>
        <Button
          type="button"
          className="min-h-14 w-full"
          variant={tone === "danger" ? "outline" : "primary"}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
        <Button type="button" variant="ghost" className="min-h-12 w-full" disabled={busy} onClick={onClose}>
          {cancelLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}

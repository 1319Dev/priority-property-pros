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
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-ink-700">{body}</p>
      <div className="mt-5 flex flex-col gap-2">
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

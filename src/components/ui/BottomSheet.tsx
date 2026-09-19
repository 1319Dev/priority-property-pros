import { useEffect, useId, type ReactNode } from "react";
import { cn } from "../../utils/cn";

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-visibility",
        open ? "visible" : "invisible",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 bg-forest-950/40 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        aria-label="Close sheet"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute inset-x-0 bottom-0 rounded-t-[1.75rem] border border-cream-200 bg-cream-50 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl transition-transform duration-200",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink-300/60" />
        <h2 id={titleId} className="font-display text-2xl text-forest-800">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

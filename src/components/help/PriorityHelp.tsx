import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  CONTACT_PRIORITY_SUPPORT_LABEL,
  PRIORITY_HELP_GREETING,
  PRIORITY_HELP_LIMIT_NOTE,
  PRIORITY_HELP_NAME,
  PRIORITY_HELP_SUBTITLE,
  PRIORITY_SUPPORT_PATH,
} from "../../data/priorityHelp";
import { BrandMark } from "../brand/Logo";
import { ButtonLink } from "../ui/Button";

export function PriorityHelp() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);
  const titleId = useId();
  const subtitleId = useId();
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    launcherRef.current?.focus();
  }, [open]);

  function closePanel(restoreFocus: boolean) {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      restoreFocusRef.current = true;
      setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed right-4 z-50 flex flex-col items-end gap-3 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:right-6"
    >
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        tabIndex={-1}
        hidden={!open}
        className="pointer-events-auto max-h-[min(32rem,calc(100dvh-7.5rem))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-3xl border border-forest-800/10 bg-cream-50 p-5 text-ink-900 shadow-xl outline-none"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 shrink-0">
            <BrandMark className="h-11 w-11" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-2xl font-semibold leading-tight text-forest-800">
              {PRIORITY_HELP_NAME}
            </h2>
            <p id={subtitleId} className="mt-1 text-sm font-semibold text-gold-700">
              {PRIORITY_HELP_SUBTITLE}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-forest-800 hover:bg-cream-100"
            onClick={() => closePanel(true)}
          >
            Close
          </button>
        </div>
        <div className="gold-rule my-4" />
        <p className="text-base leading-relaxed text-ink-700">{PRIORITY_HELP_GREETING}</p>
        <p className="mt-4 rounded-2xl border border-forest-800/10 bg-forest-50 px-4 py-3 text-sm leading-relaxed text-ink-700">
          {PRIORITY_HELP_LIMIT_NOTE}
        </p>
        <ButtonLink
          to={PRIORITY_SUPPORT_PATH}
          variant="outline"
          className="mt-4 w-full normal-case! tracking-normal! text-sm!"
        >
          {CONTACT_PRIORITY_SUPPORT_LABEL}
        </ButtonLink>
      </div>
      {open ? null : (
        <button
          ref={launcherRef}
          type="button"
          className="pointer-events-auto inline-flex min-h-14 max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-gold-600/50 bg-cream-50 py-2 pl-2 pr-4 text-left shadow-xl"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true" className="shrink-0">
            <BrandMark className="h-10 w-10" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-base font-semibold leading-tight text-forest-800">
              {PRIORITY_HELP_NAME}
            </span>
            <span className="mt-0.5 block text-xs font-semibold leading-tight text-gold-700">
              {PRIORITY_HELP_SUBTITLE}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { BrandMark } from "../brand/Logo";
import { Button } from "../ui/Button";
import { useAuth } from "../../lib/auth/useAuth";
import {
  availabilityNotice,
  containsSupportHtml,
  createBrowserHelpTransport,
  hasStoredGuestToken,
  helpErrorMessage,
  safeSupportText,
  type HelpAvailability,
  type HelpMessage,
  type HelpMode,
  type HelpResult,
  type HelpTransport,
} from "../../lib/support/client";
import { cn } from "../../utils/cn";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const browserTransport = createBrowserHelpTransport();

const LAUNCHER_CLASS =
  "fixed z-[35] right-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] inline-flex min-h-14 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-forest-800 px-4 text-cream-50 shadow-lg hover:bg-forest-700 lg:bottom-6 lg:right-6";

const PANEL_CLASS =
  "fixed z-[35] right-4 bottom-[calc(10.75rem+env(safe-area-inset-bottom))] flex w-[min(24rem,calc(100vw-2rem))] max-h-[min(36rem,calc(100dvh-14rem))] flex-col overflow-hidden rounded-3xl border border-forest-800/15 bg-cream-50 text-ink-900 shadow-2xl lg:bottom-24 lg:right-6 lg:max-h-[min(40rem,calc(100dvh-8rem))] motion-reduce:transition-none";

function emptyResult(): HelpResult {
  return {
    ok: true,
    mode: "ai",
    availability: "offline",
    humanJoined: false,
    reference: null,
    alreadyOpen: false,
    messages: [],
    guestToken: null,
    answer: null,
    error: null,
  };
}

function withAnswer(result: HelpResult): HelpMessage[] {
  if (!result.answer) return result.messages;
  const last = result.messages[result.messages.length - 1];
  if (last?.role === "assistant" && last.body === result.answer) return result.messages;
  return [
    ...result.messages,
    { id: `answer-${result.messages.length}`, role: "assistant", body: result.answer, createdAt: "" },
  ];
}

function turnstileSiteKey(): string {
  return String(import.meta.env.VITE_PRIORITY_HELP_TURNSTILE_SITE_KEY ?? "").trim();
}

export function PriorityHelp({
  transport = browserTransport,
  initialOpen = false,
  initialIntent = "ask",
}: {
  transport?: HelpTransport;
  initialOpen?: boolean;
  initialIntent?: "ask" | "human";
}) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const titleId = useId();
  const panelId = useId();
  const errorId = useId();
  const hintId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const [intent, setIntent] = useState<"ask" | "human">(initialIntent);
  const [mode, setMode] = useState<HelpMode>("ai");
  const [availability, setAvailability] = useState<HelpAvailability>("offline");
  const [humanJoined, setHumanJoined] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!initialOpen);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const siteKey = turnstileSiteKey();
  const humanComposer = mode === "human_only" || intent === "human";

  useEffect(() => {
    if (!siteKey) return undefined;
    const host = window as Window & { onPriorityHelpTurnstile?: (token: string) => void };
    host.onPriorityHelpTurnstile = (token) => setTurnstileToken(token);
    if (!document.querySelector('script[data-priority-help="turnstile"]')) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.dataset.priorityHelp = "turnstile";
      document.head.appendChild(script);
    }
    return () => {
      delete host.onPriorityHelpTurnstile;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!open) return undefined;
    let stop = false;
    const action = signedIn || hasStoredGuestToken() ? "history" : "availability";
    void transport
      .request({ action, signedIn, turnstileToken: turnstileToken || undefined })
      .then((result) => {
        if (stop) return;
        applyResult(result, "load");
      })
      .catch(() => {
        if (stop) return;
        applyResult({ ...emptyResult(), ok: false, error: "support is unavailable" }, "load");
      });
    return () => {
      stop = true;
    };
    // The token is read when the panel opens. A later Turnstile callback retries on submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signedIn, transport]);

  useEffect(() => {
    if (!open) return undefined;
    const root = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      [...(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => !el.hasAttribute("disabled"));
    const timer = window.setTimeout(() => {
      root?.querySelector<HTMLElement>("textarea")?.focus();
    }, 0);

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const launcher = launcherRef.current;
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      if (previous && previous !== root && document.contains(previous)) previous.focus();
      else launcher?.focus();
    };
  }, [open]);

  function applyResult(result: HelpResult, kind: "load" | "send" | "escalate") {
    setMode(result.mode);
    setAvailability(result.availability);
    setHumanJoined(result.humanJoined);
    setReference(result.reference);
    setReady(true);
    setBusy(false);
    if (!result.ok) {
      setError(helpErrorMessage(result.error));
      if (kind === "load") setMessages(result.messages);
      return;
    }
    setError(result.alreadyOpen ? "This request is already open. A person has not joined this chat yet." : null);
    setMessages(kind === "load" ? result.messages : withAnswer(result));
    if (kind !== "load" && !result.alreadyOpen) setDraft("");
  }

  async function submit(action: "send" | "escalate") {
    const body = draft.trim();
    if (!body) {
      setError("Add a message so support knows how to help.");
      panelRef.current?.querySelector<HTMLElement>("textarea")?.focus();
      return;
    }
    if (body.length > 2000) {
      setError(helpErrorMessage("message is too long"));
      return;
    }
    if (containsSupportHtml(body)) {
      setError(helpErrorMessage("HTML is not allowed"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await transport.request({
        action,
        body,
        signedIn,
        companyWebsite: honeypotValue(),
        turnstileToken: turnstileToken || undefined,
      });
      applyResult(result, action);
    } catch {
      setBusy(false);
      setError(helpErrorMessage("support is unavailable"));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(humanComposer ? "escalate" : "send");
  }

  if (pathname.startsWith("/app/admin")) return null;

  const hint = humanComposer
    ? availability === "offline"
      ? "Leave a message. It is saved for the team. Nobody is in this chat yet."
      : "A person is not in this chat yet. Your message is saved for the queue."
    : "Ask about registration, contractor approval, projects, estimates, fees, reviews, or Find a Pro.";

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className={LAUNCHER_CLASS}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <BrandMark decorative className="h-7 w-7 shrink-0" />
        <span className="font-display text-base font-semibold tracking-tight">Priority Help</span>
      </button>
      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={PANEL_CLASS}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gold-500/50 bg-forest-800 px-4 py-3 text-cream-50">
            <div className="flex min-w-0 items-center gap-2">
              <BrandMark decorative className="h-8 w-8 shrink-0" />
              <div className="min-w-0">
                <h2 id={titleId} className="truncate font-display text-lg font-semibold">
                  Priority Help
                </h2>
                {reference ? <p className="text-xs text-gold-300">Reference {reference}</p> : null}
              </div>
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-cream-50 hover:bg-forest-700"
              aria-label="Close Priority Help"
              onClick={() => setOpen(false)}
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>
          <p role="status" className="border-b border-forest-800/10 bg-cream-100 px-4 py-2 text-sm text-forest-800">
            {availabilityNotice(availability, humanJoined)}
          </p>
          <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Priority Help messages" className="min-h-24 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <p className="text-sm text-ink-700">{ready ? "No messages yet." : "Checking support…"}</p>
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
          </div>
          <form className="border-t border-forest-800/10 px-4 py-3" onSubmit={onSubmit}>
            <label htmlFor={`${titleId}-message`} className="text-sm font-semibold text-forest-800">
              Your message
            </label>
            <textarea
              id={`${titleId}-message`}
              value={draft}
              maxLength={2000}
              rows={3}
              aria-describedby={cn(hintId, error ? errorId : undefined)}
              aria-invalid={error ? true : undefined}
              className="mt-1 w-full resize-none rounded-2xl border border-forest-800/15 bg-cream-50 px-3 py-2 text-ink-900"
              onChange={(event) => setDraft(event.target.value)}
            />
            <p id={hintId} className="mt-1 text-xs text-ink-500">
              {hint} {draft.length}/2000
            </p>
            <input
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              name="company_website"
              defaultValue=""
              className="absolute -left-[10000px] h-px w-px overflow-hidden"
            />
            {siteKey ? (
              <div className="cf-turnstile mt-2" data-sitekey={siteKey} data-callback="onPriorityHelpTurnstile" />
            ) : null}
            {error ? (
              <p id={errorId} role="alert" className="mt-2 text-sm text-danger-600">
                {error}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {ready && humanComposer ? (
                <Button type="submit" size="sm" disabled={busy}>
                  Talk to Support
                </Button>
              ) : null}
              {ready && !humanComposer ? (
                <Button type="submit" size="sm" disabled={busy}>
                  Send
                </Button>
              ) : null}
              {ready && mode === "ai" && !humanComposer ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setIntent("human");
                    if (draft.trim()) void submit("escalate");
                  }}
                >
                  Talk to Support
                </Button>
              ) : null}
              {ready && mode === "ai" && humanComposer ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setIntent("ask")}>
                  Ask Priority Help
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function honeypotValue(): string {
  const field = document.querySelector<HTMLInputElement>('input[name="company_website"]');
  return field?.value ?? "";
}

function MessageBubble({ message }: { message: HelpMessage }) {
  if (message.role === "system") {
    return <p className="text-center text-xs text-ink-500">{safeSupportText(message.role, message.body)}</p>;
  }
  const mine = message.role === "customer";
  const label = mine ? "You" : message.role === "admin" ? "Support" : "Priority Help";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
          mine ? "bg-forest-800 text-cream-50" : "border border-gold-500/40 bg-cream-100 text-ink-900",
        )}
      >
        <p className={cn("mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]", mine ? "text-gold-300" : "text-gold-700")}>
          {label}
        </p>
        <p className="whitespace-pre-wrap">{safeSupportText(message.role, message.body)}</p>
      </div>
    </div>
  );
}

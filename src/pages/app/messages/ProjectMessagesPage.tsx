import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { ContactSharePanel } from "../../../components/marketplace/ContactSharePanel";
import { Button } from "../../../components/ui/Button";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  ensureMessageThread,
  listMyMessageThreads,
  listProjectMessages,
  markMessageThreadRead,
  sendProjectMessage,
  subscribeToProjectMessages,
} from "../../../lib/marketplace/messagingApi";
import {
  MESSAGES_EMPTY_BODY,
  MESSAGES_EMPTY_TITLE,
  MESSAGES_LOCKED_BODY,
  THREAD_EMPTY_BODY,
  assertMessageBodyAllowed,
  customerFacingMessageError,
  desktopEnterSends,
  formatInboxTime,
  inboxPreview,
  isWideInbox,
  layoutThreadMessages,
  messageComposerHint,
  messageNotificationHref,
  sortMessageThreads,
  threadContextHref,
  threadPlaceLabel,
  type MessageThreadSummary,
  type ProjectMessage,
} from "../../../lib/marketplace/messaging";

const POLL_MS = 12_000;

type PendingMessage = {
  id: string;
  body: string;
  created_at: string;
  failed: boolean;
};

export function CustomerMessagesPage() {
  return <ProjectMessagesPage role="customer" />;
}

export function ProMessagesPage() {
  return <ProjectMessagesPage role="contractor" />;
}

export function ProjectMessagesPage({ role }: { role: "customer" | "contractor" }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { projectId = "", contractorProfileId = "" } = useParams();
  const threadRoute = Boolean(projectId && contractorProfileId);
  const base = role === "customer" ? "/app/customer/messages" : "/app/pro/messages";
  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const selected = threads.find(
    (thread) => thread.project_id === projectId && thread.contractor_profile_id === contractorProfileId,
  );
  const ordered = useMemo(() => sortMessageThreads(threads), [threads]);

  const loadThreads = useCallback(async () => {
    const rows = await listMyMessageThreads();
    setThreads(sortMessageThreads(rows));
    return rows;
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const rows = await listProjectMessages(id);
    setMessages(rows);
  }, []);

  useEffect(() => {
    let stop = false;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadThreads()
        .catch(() => {
          if (!stop) setError("Could not load messages.");
        })
        .finally(() => {
          if (!stop) setLoading(false);
        });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    const onVisible = () => load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadThreads]);

  useEffect(() => {
    if (threadRoute || loading || ordered.length === 0 || !isWideInbox()) return;
    const latest = ordered[0];
    navigate(`${base}/${latest.project_id}/${latest.contractor_profile_id}`, { replace: true });
  }, [threadRoute, loading, ordered, navigate, base]);

  useEffect(() => {
    if (!threadRoute) {
      setThreadId(null);
      setMessages([]);
      setPending([]);
      setLocked(false);
      setOpening(false);
      return;
    }
    let stop = false;
    setLocked(false);
    setError(null);
    setOpening(true);
    void ensureMessageThread(projectId, contractorProfileId)
      .then(async (id) => {
        if (stop) return;
        setThreadId(id);
        await loadMessages(id);
        await loadThreads();
        await markMessageThreadRead(id).catch(() => undefined);
        await loadThreads();
      })
      .catch((err: Error) => {
        if (stop) return;
        setThreadId(null);
        setMessages([]);
        const message = customerFacingMessageError(err.message);
        if (message === MESSAGES_LOCKED_BODY) setLocked(true);
        else setError(message);
      })
      .finally(() => {
        if (!stop) setOpening(false);
      });
    return () => {
      stop = true;
    };
  }, [threadRoute, projectId, contractorProfileId, loadMessages, loadThreads]);

  useEffect(() => {
    if (!threadId) return;
    const unsubscribe = subscribeToProjectMessages(threadId, () => {
      void loadMessages(threadId).catch(() => undefined);
      void loadThreads().catch(() => undefined);
    });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadMessages(threadId).catch(() => undefined);
    }, POLL_MS);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [threadId, loadMessages, loadThreads]);

  const bubbles = useMemo(() => {
    const extra = pending.map((item) => ({
      id: item.id,
      sender_profile_id: profile?.id ?? "me",
      body: item.body,
      created_at: item.created_at,
    }));
    return layoutThreadMessages({
      messages: [...messages, ...extra],
      viewerId: profile?.id ?? "",
      otherLabel: selected?.other_party_label || selected?.contractor_label || "Pro",
    });
  }, [messages, pending, profile?.id, selected]);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === "function") {
      endRef.current.scrollIntoView({ block: "end" });
    }
  }, [bubbles.length, threadId]);

  async function deliver(body: string, pendingId: string) {
    if (!profile || !threadId) return;
    setSending(true);
    setError(null);
    try {
      await sendProjectMessage(threadId, profile.id, body);
      setPending((current) => current.filter((item) => item.id !== pendingId));
      await loadMessages(threadId);
      await loadThreads();
    } catch (err) {
      setPending((current) => current.map((item) => (item.id === pendingId ? { ...item, failed: true } : item)));
      setError(customerFacingMessageError(err instanceof Error ? err.message : ""));
    } finally {
      setSending(false);
    }
  }

  async function onSend(event?: FormEvent) {
    event?.preventDefault();
    if (!profile || !threadId || sending) return;
    let clean = "";
    try {
      clean = assertMessageBodyAllowed(draft);
    } catch (err) {
      setError(customerFacingMessageError(err instanceof Error ? err.message : ""));
      return;
    }
    const pendingId = `pending-${crypto.randomUUID()}`;
    setPending((current) => [
      ...current,
      { id: pendingId, body: clean, created_at: new Date().toISOString(), failed: false },
    ]);
    setDraft("");
    await deliver(clean, pendingId);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const desktop = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches;
    if (!desktopEnterSends(desktop, event.key, event.shiftKey)) return;
    event.preventDefault();
    void onSend();
  }

  const place = selected ? threadPlaceLabel(selected) : null;
  const otherName = selected?.other_party_label || selected?.contractor_label || (role === "customer" ? "Connected pro" : "Customer");
  const contextHref = selected ? threadContextHref(role, selected) : null;

  return (
    <div className="space-y-4 lg:grid lg:min-h-[70vh] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-stretch lg:gap-6 lg:space-y-0">
      <section className={threadRoute ? "hidden lg:block" : "block"} aria-label="Conversations">
        <header className="mb-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Messages</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Messages</h1>
        </header>
        {loading ? <p className="text-sm text-ink-500">Loading conversations…</p> : null}
        {!loading && ordered.length === 0 ? (
          <EmptyState title={MESSAGES_EMPTY_TITLE} body={MESSAGES_EMPTY_BODY} />
        ) : null}
        <ul className="space-y-2">
          {ordered.map((thread) => {
            const active =
              thread.project_id === projectId && thread.contractor_profile_id === contractorProfileId;
            const unread = thread.unread_count > 0;
            const href = messageNotificationHref(role, {
              project_id: thread.project_id,
              contractor_profile_id: thread.contractor_profile_id,
            });
            return (
              <li key={`${thread.project_id}:${thread.contractor_profile_id}`}>
                <Link
                  to={href ?? base}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-3xl border px-4 py-3 ${
                    active ? "border-forest-800 bg-cream-100" : "border-forest-800/10 bg-cream-50"
                  } ${unread ? "font-semibold" : ""}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-forest-800">{thread.other_party_label || thread.contractor_label}</span>
                      <span className="block text-sm text-ink-700">{thread.project_title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-500">
                      {formatInboxTime(thread.last_message_at)}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-sm text-ink-500">
                      {inboxPreview(thread.last_preview, thread.last_sender_is_viewer)}
                    </span>
                    {unread ? (
                      <span
                        className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-[0.65rem] font-bold text-forest-950"
                        aria-label={`${thread.unread_count} unread`}
                      >
                        {thread.unread_count}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={threadRoute ? "flex min-h-[70vh] flex-col" : "hidden lg:block"} aria-label="Conversation">
        {!threadRoute ? null : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <Link to={base} className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 lg:hidden">
              Back to messages
            </Link>
            <header>
              <p className="font-display text-3xl font-semibold text-forest-800">{otherName}</p>
              <h2 className="mt-1 text-lg font-semibold text-forest-800">{selected?.project_title ?? "Project"}</h2>
              {place ? <p className="text-sm text-ink-500">{place}</p> : null}
              {contextHref ? (
                <Link to={contextHref} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 underline">
                  {selected?.booking_id ? "View booking" : "View project"}
                </Link>
              ) : null}
              <p className="mt-2 text-sm text-ink-500">This thread does not show phone, email, or street.</p>
            </header>
            {opening ? <p className="text-sm text-ink-500">Opening conversation…</p> : null}
            {locked ? <EmptyState title="Messaging is locked" body={MESSAGES_LOCKED_BODY} /> : null}
            {!locked && threadId ? (
              <ContactSharePanel role={role} projectId={projectId} contractorProfileId={contractorProfileId} />
            ) : null}
            {!locked && threadId && messages.length === 0 && pending.length === 0 ? (
              <EmptyState title="Start the conversation" body={THREAD_EMPTY_BODY} />
            ) : null}
            {!locked && bubbles.length > 0 ? (
              <ol className="min-w-0 flex-1 space-y-2" aria-label="Messages">
                {bubbles.map((item) =>
                  item.kind === "day" ? (
                    <li key={item.id} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-500">
                      {item.label}
                    </li>
                  ) : (
                    <li key={item.id} className={`flex ${item.mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] ${item.mine ? "text-right" : "text-left"}`}>
                        {item.showLabel ? (
                          <p className="mb-1 text-xs font-semibold text-ink-500">{item.senderLabel}</p>
                        ) : null}
                        <p
                          className={`rounded-3xl px-4 py-3 text-sm leading-relaxed ${
                            item.mine ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-ink-900"
                          }`}
                        >
                          {item.body}
                        </p>
                        <p className="mt-1 text-[0.7rem] text-ink-500">{formatInboxTime(item.createdAt)}</p>
                        {item.id.startsWith("pending-") && pending.find((row) => row.id === item.id)?.failed ? (
                          <button
                            type="button"
                            className="mt-1 min-h-11 text-sm font-semibold text-forest-800 underline"
                            onClick={() => void deliver(item.body ?? "", item.id)}
                          >
                            Retry
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ),
                )}
              </ol>
            ) : null}
            <div ref={endRef} />
            {!locked && threadId ? (
              <form
                onSubmit={(event) => void onSend(event)}
                className="sticky bottom-24 z-30 mt-auto space-y-2 border-t border-forest-800/10 bg-cream-50/95 pt-3 pb-2 lg:bottom-0"
              >
                <label className="block">
                  <span className="sr-only">Message</span>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={3}
                    maxLength={4000}
                    placeholder="Write about the work"
                    aria-label="Message"
                    className="min-h-24 w-full rounded-3xl border border-forest-800/15 px-4 py-3 text-base"
                  />
                </label>
                <FormError message={error} />
                <p className="text-xs leading-relaxed text-ink-500">{messageComposerHint(role === "customer" ? false : true)}</p>
                <Button type="submit" className="min-h-14 w-full" disabled={sending || draft.trim().length === 0}>
                  {sending ? "Sending…" : "Send"}
                </Button>
              </form>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

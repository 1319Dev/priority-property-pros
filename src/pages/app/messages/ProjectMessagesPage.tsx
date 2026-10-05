import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { ContactSharePanel } from "../../../components/marketplace/ContactSharePanel";
import { Button } from "../../../components/ui/Button";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import { fetchMyNotifications } from "../../../lib/marketplace/api";
import {
  ensureMessageThread,
  listMyMessageThreads,
  listProjectMessages,
  sendProjectMessage,
  subscribeToProjectMessages,
} from "../../../lib/marketplace/messagingApi";
import {
  MESSAGE_COMPOSER_HINT,
  MESSAGE_NOTIFICATION_BODY,
  MESSAGES_EMPTY_BODY,
  MESSAGES_EMPTY_TITLE,
  MESSAGES_LOCKED_BODY,
  THREAD_EMPTY_BODY,
  assertMessageBodyAllowed,
  customerFacingMessageError,
  messageNotificationHref,
  threadPlaceLabel,
  type MessageThreadSummary,
  type ProjectMessage,
} from "../../../lib/marketplace/messaging";

const POLL_MS = 12_000;

export function CustomerMessagesPage() {
  return <ProjectMessagesPage role="customer" />;
}

export function ProMessagesPage() {
  return <ProjectMessagesPage role="contractor" />;
}

export function ProjectMessagesPage({ role }: { role: "customer" | "contractor" }) {
  const { profile } = useAuth();
  const { projectId = "", contractorProfileId = "" } = useParams();
  const threadRoute = Boolean(projectId && contractorProfileId);
  const base = role === "customer" ? "/app/customer/messages" : "/app/pro/messages";
  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updates, setUpdates] = useState<Array<{ id: string; href: string }>>([]);

  const selected = threads.find(
    (thread) => thread.project_id === projectId && thread.contractor_profile_id === contractorProfileId,
  );

  const loadThreads = useCallback(async () => {
    const rows = await listMyMessageThreads();
    setThreads(rows);
    return rows;
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const rows = await listProjectMessages(id);
    setMessages(rows);
  }, []);

  useEffect(() => {
    let stop = false;
    void loadThreads()
      .catch(() => {
        if (!stop) setError("Could not load messages.");
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    const timer = window.setInterval(() => {
      void loadThreads().catch(() => undefined);
    }, POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [loadThreads]);

  useEffect(() => {
    if (!profile) return;
    void fetchMyNotifications()
      .then((rows) => {
        const next = rows
          .filter((row) => row.kind === "message.received" && !row.read_at)
          .map((row) => {
            const href = messageNotificationHref(role, row.payload);
            return href ? { id: row.id, href } : null;
          })
          .filter((row): row is { id: string; href: string } => row != null);
        setUpdates(next);
      })
      .catch(() => setUpdates([]));
  }, [profile, role, threadId]);

  useEffect(() => {
    if (!threadRoute) {
      setThreadId(null);
      setMessages([]);
      setLocked(false);
      return;
    }
    let stop = false;
    setLocked(false);
    setError(null);
    void ensureMessageThread(projectId, contractorProfileId)
      .then(async (id) => {
        if (stop) return;
        setThreadId(id);
        await loadMessages(id);
        await loadThreads();
      })
      .catch((err: Error) => {
        if (stop) return;
        setThreadId(null);
        setMessages([]);
        const message = customerFacingMessageError(err.message);
        if (message === MESSAGES_LOCKED_BODY) setLocked(true);
        else setError(message);
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
      void loadMessages(threadId).catch(() => undefined);
    }, POLL_MS);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [threadId, loadMessages, loadThreads]);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!profile || !threadId) return;
    setSending(true);
    setError(null);
    try {
      const clean = assertMessageBodyAllowed(draft);
      await sendProjectMessage(threadId, profile.id, clean);
      setDraft("");
      await loadMessages(threadId);
      await loadThreads();
    } catch (err) {
      setError(customerFacingMessageError(err instanceof Error ? err.message : ""));
    } finally {
      setSending(false);
    }
  }

  const place = selected ? threadPlaceLabel(selected) : null;

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <section className={threadRoute ? "hidden lg:block" : "block"}>
        <header className="mb-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Messages</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Messages</h1>
        </header>
        {updates.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {updates.slice(0, 3).map((update) => (
              <li key={update.id}>
                <Link to={update.href} className="block rounded-2xl bg-cream-100 px-4 py-3 text-sm text-forest-800">
                  {MESSAGE_NOTIFICATION_BODY}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {loading ? <p className="text-sm text-ink-500">Loading…</p> : null}
        {!loading && threads.length === 0 ? (
          <EmptyState title={MESSAGES_EMPTY_TITLE} body={MESSAGES_EMPTY_BODY} />
        ) : null}
        <ul className="space-y-2">
          {threads.map((thread) => {
            const active =
              thread.project_id === projectId && thread.contractor_profile_id === contractorProfileId;
            const where = threadPlaceLabel(thread);
            return (
              <li key={`${thread.project_id}:${thread.contractor_profile_id}`}>
                <Link
                  to={`${base}/${thread.project_id}/${thread.contractor_profile_id}`}
                  className={`block rounded-3xl border px-4 py-3 ${
                    active ? "border-forest-800 bg-cream-100" : "border-forest-800/10 bg-cream-50"
                  }`}
                >
                  <p className="font-semibold text-forest-800">{thread.project_title}</p>
                  <p className="text-sm text-ink-700">{thread.contractor_label}</p>
                  {where ? <p className="text-sm text-ink-500">{where}</p> : null}
                  {thread.last_preview ? (
                    <p className="mt-1 line-clamp-2 text-sm text-ink-500">{thread.last_preview}</p>
                  ) : (
                    <p className="mt-1 text-sm text-ink-500">No messages yet</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={threadRoute ? "block" : "hidden lg:block"}>
        {!threadRoute ? (
          <EmptyState title="Choose a conversation" body={MESSAGES_EMPTY_BODY} />
        ) : (
          <div className="space-y-4">
            <Link to={base} className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 lg:hidden">
              Back to messages
            </Link>
            <header>
              <h2 className="font-display text-3xl font-semibold text-forest-800">
                {selected?.project_title ?? "Project"}
              </h2>
              <p className="mt-1 text-sm text-ink-700">{selected?.contractor_label ?? "Connected pro"}</p>
              {place ? <p className="text-sm text-ink-500">{place}</p> : null}
              <p className="mt-2 text-sm text-ink-500">
                This thread does not show phone, email, or street.
              </p>
            </header>
            <FormError message={error} />
            {locked ? <EmptyState title="Messaging is locked" body={MESSAGES_LOCKED_BODY} /> : null}
            {!locked && threadId ? (
              <ContactSharePanel
                role={role}
                projectId={projectId}
                contractorProfileId={contractorProfileId}
              />
            ) : null}
            {!locked && threadId && messages.length === 0 ? (
              <EmptyState title="Start the conversation" body={THREAD_EMPTY_BODY} />
            ) : null}
            {!locked && messages.length > 0 ? (
              <ol className="space-y-2" aria-label="Messages">
                {messages.map((message) => {
                  const mine = message.sender_profile_id === profile?.id;
                  return (
                    <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <p
                        className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-relaxed ${
                          mine ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-ink-900"
                        }`}
                      >
                        {message.body}
                      </p>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {!locked && threadId ? (
              <form onSubmit={(event) => void onSend(event)} className="sticky bottom-24 z-30 space-y-2 bg-cream-50/95 pb-2 lg:bottom-0">
                <label className="block">
                  <span className="sr-only">Message</span>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={3}
                    maxLength={4000}
                    placeholder="Write about the work"
                    className="min-h-24 w-full rounded-3xl border border-forest-800/15 px-4 py-3 text-base"
                  />
                </label>
                <p className="text-xs leading-relaxed text-ink-500">{MESSAGE_COMPOSER_HINT}</p>
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

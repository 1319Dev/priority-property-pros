import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FormError } from "../../lib/auth/AuthCard";
import { useAuth } from "../../lib/auth/useAuth";
import {
  ensureMessageThread,
  listMyMessageThreads,
  listProjectMessages,
  markMessageThreadRead,
  sendProjectMessage,
} from "../../lib/marketplace/messagingApi";
import {
  CONTRACTOR_MESSAGES_LOCKED_BODY,
  MESSAGES_LOCKED_BODY,
  THREAD_EMPTY_BODY,
  assertMessageBodyAllowed,
  customerFacingMessageError,
  layoutThreadMessages,
  messageComposerHint,
  threadContactNotice,
} from "../../lib/marketplace/messaging";
import { Button } from "../ui/Button";

export function JobThreadPanel({
  projectId,
  contractorProfileId,
  customerLabel,
  role = "contractor",
  contactShared = false,
}: {
  projectId: string;
  contractorProfileId: string;
  customerLabel: string;
  role?: "customer" | "contractor";
  contactShared?: boolean;
}) {
  const { profile } = useAuth();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof listProjectMessages>>>([]);
  const [draft, setDraft] = useState("");
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(true);

  const loadMessages = useCallback(async (id: string) => {
    setMessages(await listProjectMessages(id));
  }, []);

  useEffect(() => {
    let stop = false;
    setLoadingThread(true);
    void ensureMessageThread(projectId, contractorProfileId)
      .then(async (id) => {
        if (stop) return;
        setThreadId(id);
        setLocked(false);
        await loadMessages(id);
        await markMessageThreadRead(id).catch(() => undefined);
      })
      .catch((err: Error) => {
        if (stop) return;
        const message = customerFacingMessageError(err.message);
        if (message === MESSAGES_LOCKED_BODY) setLocked(true);
        else setError(message);
      })
      .finally(() => {
        if (!stop) setLoadingThread(false);
      });
    return () => {
      stop = true;
    };
  }, [contractorProfileId, loadMessages, projectId]);

  const bubbles = useMemo(
    () =>
      layoutThreadMessages({
        messages,
        viewerId: profile?.id ?? "",
        otherLabel: customerLabel,
      }),
    [customerLabel, messages, profile?.id],
  );

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!profile || !threadId || sending) return;
    let clean = "";
    try {
      clean = assertMessageBodyAllowed(draft);
    } catch (err) {
      setError(customerFacingMessageError(err instanceof Error ? err.message : ""));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendProjectMessage(threadId, profile.id, clean);
      setDraft("");
      await loadMessages(threadId);
      await listMyMessageThreads().catch(() => undefined);
    } catch (err) {
      setError(customerFacingMessageError(err instanceof Error ? err.message : ""));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4" aria-label="Messages">
      <h2 className="font-display text-2xl text-forest-800">Messages</h2>
      <p className="text-sm text-ink-500">{threadContactNotice(contactShared)}</p>
      {loadingThread ? <p className="text-sm text-ink-500">Loading messages…</p> : null}
      {!loadingThread && locked ? (
        <p className="text-sm text-ink-700">
          {role === "contractor" ? CONTRACTOR_MESSAGES_LOCKED_BODY : MESSAGES_LOCKED_BODY}
        </p>
      ) : null}
      {!loadingThread && !locked && bubbles.length === 0 ? <p className="text-sm text-ink-700">{THREAD_EMPTY_BODY}</p> : null}
      {bubbles.length > 0 ? (
        <ol className="max-h-80 space-y-2 overflow-y-auto" aria-label="Messages">
          {bubbles.map((item) =>
            item.kind === "day" ? (
              <li key={item.id} className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-ink-500">
                {item.label}
              </li>
            ) : (
              <li key={item.id} className={`flex ${item.mine ? "justify-end" : "justify-start"}`}>
                <p
                  className={`max-w-[85%] break-words rounded-3xl px-4 py-3 text-sm leading-relaxed ${
                    item.mine ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-ink-900"
                  }`}
                >
                  {item.body}
                </p>
              </li>
            ),
          )}
        </ol>
      ) : null}
      {!locked && threadId ? (
        <form className="space-y-2" onSubmit={(event) => void onSend(event)}>
          <label className="block">
            <span className="sr-only">Message</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="Write about the work"
              aria-label="Message"
              className="min-h-24 w-full rounded-3xl border border-forest-800/15 px-4 py-3 text-base"
            />
          </label>
          <FormError message={error} />
          <p className="text-xs leading-relaxed text-ink-500">{messageComposerHint(role, contactShared)}</p>
          <Button type="submit" className="min-h-14 w-full" disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </form>
      ) : (
        <FormError message={error} />
      )}
    </section>
  );
}

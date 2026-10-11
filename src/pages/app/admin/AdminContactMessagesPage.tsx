import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button } from "../../../components/ui/Button";
import { FormError } from "../../../lib/auth/AuthCard";
import {
  contactEmailWasSent,
  getContactMessage,
  listContactMessages,
  markContactMessageHandled,
  type ContactMessage,
} from "../../../lib/admin/contactMessagesApi";
import { friendlyAdminError } from "../../../lib/admin/friendlyAdminError";
import { formatCentralTimestamp } from "../../../lib/admin/money";
import { contactTopicLabel } from "../../../lib/contact/contactForm";
import { isSupabaseConfigured } from "../../../lib/supabase/config";

export function AdminContactMessagesPage() {
  const { messageId } = useParams();
  const [rows, setRows] = useState<ContactMessage[] | null>(null);
  const [detail, setDetail] = useState<ContactMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listContactMessages()
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "";
        if (!isSupabaseConfigured() || /not configured/i.test(message)) {
          setOffline(true);
          return;
        }
        setError(message || "Could not load contact messages.");
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!messageId) {
      setDetail(null);
      return;
    }
    const known = rows?.find((row) => row.id === messageId);
    if (known) {
      setDetail(known);
      return;
    }
    if (rows == null) return;
    let cancelled = false;
    void getContactMessage(messageId)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetail(null);
        setError(err instanceof Error ? err.message : "Could not load that message.");
      });
    return () => {
      cancelled = true;
    };
  }, [messageId, rows]);

  const visible = useMemo(() => {
    const source = rows ?? [];
    const q = query.trim().toLowerCase();
    return source.filter((row) => {
      if (filter === "open" && row.handledAt) return false;
      if (!q) return true;
      const haystack = [row.name, row.email, row.phone ?? "", contactTopicLabel(row.topic), row.message]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, filter]);

  async function markHandled(row: ContactMessage) {
    setBusy(true);
    setError(null);
    try {
      const handledAt = (await markContactMessageHandled(row.id)) ?? new Date().toISOString();
      const next = { ...row, handledAt };
      setRows((current) => current?.map((item) => (item.id === row.id ? next : item)) ?? current);
      setDetail(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : friendlyAdminError(null, "Could not mark that message handled."));
    } finally {
      setBusy(false);
    }
  }

  if (offline) {
    return <EmptyState title="Marketplace not connected" body="Contact messages need Supabase." />;
  }

  if (messageId) {
    return (
      <ContactMessageDetail
        row={detail}
        loading={rows == null && !error}
        error={error}
        busy={busy}
        onHandled={() => {
          if (detail) void markHandled(detail);
        }}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Contact messages</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Messages from the public contact form, newest first. Mark one handled after you reply. The reply link opens
          your email with their address.
        </p>
      </header>
      <FormError message={error} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
            Search messages
          </span>
          <input
            className="min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex gap-2" role="group" aria-label="Message filter">
          <FilterButton pressed={filter === "open"} onClick={() => setFilter("open")}>
            Unhandled
          </FilterButton>
          <FilterButton pressed={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterButton>
        </div>
      </div>
      {rows == null ? (
        <p className="text-sm text-ink-700">Loading messages…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          title={query.trim() ? "No messages match that search" : "No contact messages yet"}
          body={query.trim() ? "Try a name, email, or a word from the message." : "New notes from the contact page will show up here."}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={row.id} className="min-w-0 rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link className="min-w-0 font-semibold text-forest-800 underline" to={`/app/admin/contact/${row.id}`}>
                  {row.name}
                </Link>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">
                  {row.handledAt ? "Handled" : "New"}
                </p>
              </div>
              <p className="mt-1 break-all text-sm text-ink-700">{row.email}</p>
              {row.phone ? <p className="text-sm text-ink-700">{row.phone}</p> : null}
              <p className="mt-2 text-sm text-ink-700">{contactTopicLabel(row.topic)}</p>
              <p className="mt-2 line-clamp-3 break-words text-sm text-ink-700">{row.message}</p>
              <p className="mt-2 text-sm text-ink-500">{formatCentralTimestamp(row.createdAt)}</p>
              <p className="mt-1 text-sm font-semibold text-forest-800">
                {contactEmailWasSent(row.emailStatus) ? "Email sent" : "Email not sent"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
        pressed ? "bg-forest-800 text-cream-50" : "text-forest-800 hover:bg-cream-100"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ContactMessageDetail({
  row,
  loading,
  error,
  busy,
  onHandled,
}: {
  row: ContactMessage | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onHandled: () => void;
}) {
  if (loading) return <p className="text-sm text-ink-700">Loading message…</p>;
  if (!row) {
    return (
      <div className="space-y-4">
        <FormError message={error} />
        <EmptyState title="Message not found" body="It may have been removed, or it is outside this list." />
        <Link className="inline-flex min-h-11 items-center font-semibold text-forest-800 underline" to="/app/admin/contact">
          All messages
        </Link>
      </div>
    );
  }
  const replyHref = `mailto:${row.email}?subject=${encodeURIComponent(`Re: ${contactTopicLabel(row.topic)}`)}`;
  return (
    <div className="min-w-0 space-y-6">
      <Link className="inline-flex min-h-11 items-center font-semibold text-forest-800 underline" to="/app/admin/contact">
        All messages
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Contact message</p>
        <h1 className="mt-2 break-words font-display text-4xl font-semibold text-forest-800">{row.name}</h1>
        <p className="mt-2 text-sm text-ink-500">{formatCentralTimestamp(row.createdAt)}</p>
      </header>
      <FormError message={error} />
      <dl className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-4 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Email</dt>
          <dd className="mt-1 break-all text-ink-700">{row.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Phone</dt>
          <dd className="mt-1 text-ink-700">{row.phone ?? "Not provided"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Topic</dt>
          <dd className="mt-1 text-ink-700">{contactTopicLabel(row.topic)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Email to support</dt>
          <dd className="mt-1 font-semibold text-forest-800">
            {contactEmailWasSent(row.emailStatus) ? "Email sent" : "Email not sent"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Message</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-ink-700">{row.message}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-3 sm:flex-row">
        <a className="inline-flex min-h-12 items-center justify-center rounded-full bg-forest-800 px-5 text-sm font-semibold uppercase tracking-[0.12em] text-cream-50" href={replyHref}>
          Reply
        </a>
        {row.handledAt ? (
          <p className="inline-flex min-h-12 items-center text-sm font-semibold text-forest-800">
            Handled {formatCentralTimestamp(row.handledAt)}
          </p>
        ) : (
          <Button type="button" variant="outline" disabled={busy} onClick={onHandled}>
            {busy ? "Saving…" : "Mark handled"}
          </Button>
        )}
      </div>
    </div>
  );
}

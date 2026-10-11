import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, useParams, useSearchParams } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { FormError } from "../../../lib/auth/AuthCard";
import {
  deleteCannedResponse,
  getSupportConversation,
  heartbeatSupport,
  listCannedResponses,
  listSupportArticles,
  listSupportQueue,
  noteSupport,
  purgeExpiredSupport,
  replySupport,
  saveCannedResponse,
  saveSupportArticle,
  searchSupport,
  setSupportPresence,
  setSupportPriority,
  setSupportRetention,
  setSupportStatus,
  subscribeSupportDesk,
  supportAnalytics,
  takeoverSupport,
  type CannedResponse,
  type SupportAnalytics,
  type SupportArticle,
  type SupportAvailability,
  type SupportConversation,
  type SupportQueue,
  type SupportQueuePage,
  type SupportSearchHit,
} from "../../../lib/admin/supportApi";

const QUEUES: Array<{ id: SupportQueue; label: string }> = [
  { id: "open", label: "Open" },
  { id: "assigned", label: "In progress" },
  { id: "waiting", label: "Waiting" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
  { id: "mine", label: "Mine" },
  { id: "all", label: "All" },
];

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

function queueFrom(value: string | null): SupportQueue {
  return QUEUES.some((item) => item.id === value) ? (value as SupportQueue) : "open";
}

function statusLabel(status: string): string {
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "WAITING_ON_CUSTOMER") return "Waiting on customer";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function SupportSubnav() {
  const link = "inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-forest-800 hover:bg-cream-100";
  return (
    <nav aria-label="Support sections" className="flex flex-wrap gap-2">
      <NavLink to="/app/admin/support" end className={link}>
        Queues
      </NavLink>
      <NavLink to="/app/admin/support/kb" className={link}>
        Knowledge
      </NavLink>
      <NavLink to="/app/admin/support/analytics" className={link}>
        Analytics
      </NavLink>
    </nav>
  );
}

function PageIntro({ title, body }: { title: string; body: string }) {
  return (
    <header className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Support</p>
      <h1 className="font-display text-4xl font-semibold text-forest-800">{title}</h1>
      <p className="max-w-2xl text-ink-700">{body}</p>
      <SupportSubnav />
    </header>
  );
}

export function AdminSupportQueuePage() {
  const [params] = useSearchParams();
  const queue = queueFrom(params.get("queue"));
  const [page, setPage] = useState<SupportQueuePage | null>(null);
  const [hits, setHits] = useState<SupportSearchHit[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState("");

  useEffect(() => {
    let stop = false;
    const load = () => {
      void listSupportQueue(queue)
        .then((next) => {
          if (!stop) setPage(next);
        })
        .catch((err: unknown) => {
          if (!stop) setError(err instanceof Error ? err.message : "Could not load the support queue.");
        });
    };
    load();
    const unsubscribe = subscribeSupportDesk(() => {
      setLive("A support conversation changed.");
      load();
    });
    void heartbeatSupport().catch(() => undefined);
    const timer = window.setInterval(() => {
      void heartbeatSupport().catch(() => undefined);
    }, 30_000);
    return () => {
      stop = true;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [queue]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setHits(await searchSupport(query));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not search support history.");
    }
  }

  async function setPresence(status: SupportAvailability) {
    setError(null);
    try {
      const availability = await setSupportPresence(status);
      setPage((current) => (current ? { ...current, availability } : current));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update your support status.");
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Support Center"
        body="Open, waiting, and resolved Priority Help tickets. A customer is told a teammate joined only after you take the conversation."
      />
      <p role="status" className="sr-only">
        {live}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-ink-700">Desk is {page?.availability ?? "offline"}.</p>
        {(["available", "away", "offline"] as const).map((status) => (
          <Button key={status} type="button" size="sm" variant={page?.availability === status ? "primary" : "outline"} onClick={() => void setPresence(status)}>
            {status}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Support queues">
        {QUEUES.map((item) => (
          <Link
            key={item.id}
            to={item.id === "open" ? "/app/admin/support" : `/app/admin/support?queue=${item.id}`}
            className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold ${
              queue === item.id ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800"
            }`}
            aria-current={queue === item.id ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={onSearch}>
        <label className="sr-only" htmlFor="support-search">
          Search support history
        </label>
        <input
          id="support-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search PH-10001 or a phrase"
          className="min-h-12 min-w-0 flex-1 rounded-full border border-forest-800/15 bg-cream-50 px-4"
        />
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      <FormError message={error} />
      {hits ? (
        <ul className="space-y-2">
          {hits.length === 0 ? <li className="text-sm text-ink-700">No matching history.</li> : null}
          {hits.map((hit) => (
            <li key={`${hit.id}-${hit.createdAt}`}>
              <Link className="block rounded-2xl bg-cream-100 px-4 py-3 text-forest-800" to={`/app/admin/support/${hit.id}`}>
                <span className="font-semibold">{hit.reference ?? "No reference"}</span>
                <span className="ml-2 text-xs uppercase tracking-wide text-ink-500">{hit.visibility}</span>
                <p className="mt-1 text-sm text-ink-700">{hit.excerpt}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="divide-y divide-forest-800/10 rounded-3xl border border-forest-800/10 bg-cream-50">
        {(page?.rows ?? []).length === 0 ? <li className="px-4 py-8 text-sm text-ink-700">No conversations in this queue.</li> : null}
        {page?.rows.map((row) => (
          <li key={row.id}>
            <Link className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-cream-100" to={`/app/admin/support/${row.id}`}>
              <span>
                <span className="font-semibold text-forest-800">{row.reference ?? "No reference"}</span>
                <span className="ml-2 text-sm text-ink-700">{row.guest ? "Guest" : row.displayName || "Account"}</span>
              </span>
              <span className="text-sm text-ink-500">
                {row.role ?? "Guest"} · {statusLabel(row.status)} · {row.priority}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminSupportConversationPage() {
  const { conversationId = "" } = useParams();
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState("");

  useEffect(() => {
    let stop = false;
    const load = () => {
      void getSupportConversation(conversationId)
        .then((next) => {
          if (!stop) setConversation(next);
        })
        .catch((err: unknown) => {
          if (!stop) setError(err instanceof Error ? err.message : "Could not open that conversation.");
        });
    };
    load();
    void listCannedResponses()
      .then((rows) => {
        if (!stop) setCanned(rows);
      })
      .catch(() => undefined);
    const unsubscribe = subscribeSupportDesk(() => {
      setLive("New support message.");
      load();
    });
    return () => {
      stop = true;
      unsubscribe();
    };
  }, [conversationId]);

  async function run(action: () => Promise<SupportConversation>, clear: "reply" | "note" | null) {
    setError(null);
    try {
      setConversation(await action());
      if (clear === "reply") setReply("");
      if (clear === "note") setNote("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update this conversation.");
    }
  }

  const account = conversation?.account;
  const name = [account?.firstName, account?.lastName].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <PageIntro title={conversation?.reference ?? "Conversation"} body="Public replies are visible to the customer. Internal notes stay on this screen." />
      <p role="status" className="sr-only">
        {live}
      </p>
      <FormError message={error} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <p className="text-sm text-forest-800">
            {conversation?.humanJoined
              ? "A support teammate has joined."
              : "A person has not joined this chat yet. Take over before the customer is told someone is here."}
          </p>
          <div className="space-y-3" aria-live="polite" aria-relevant="additions">
            {conversation?.messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.visibility === "internal"
                    ? "rounded-2xl border border-dashed border-gold-600 bg-gold-500/10 px-4 py-3"
                    : "rounded-2xl bg-cream-100 px-4 py-3"
                }
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">
                  {message.visibility === "internal" ? "Internal note" : message.role}
                </p>
                {message.visibility === "internal" ? <p className="text-xs text-ink-500">Customers never see this.</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-ink-900">{message.body}</p>
              </article>
            ))}
          </div>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => replySupport(conversationId, reply), "reply");
            }}
          >
            <label htmlFor="support-reply" className="text-sm font-semibold text-forest-800">
              Reply to the customer
            </label>
            <textarea id="support-reply" value={reply} maxLength={4000} rows={4} className="w-full rounded-2xl border border-forest-800/15 px-3 py-2" onChange={(event) => setReply(event.target.value)} />
            {canned.length > 0 ? (
              <label className="block text-sm text-ink-700">
                Insert a canned response
                <select
                  className="mt-1 min-h-12 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3"
                  defaultValue=""
                  onChange={(event) => {
                    const item = canned.find((row) => row.id === event.target.value);
                    if (item) setReply(item.body);
                  }}
                >
                  <option value="">Choose</option>
                  {canned.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Button type="submit" size="sm">
              Send reply
            </Button>
          </form>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => noteSupport(conversationId, note), "note");
            }}
          >
            <label htmlFor="support-note" className="text-sm font-semibold text-forest-800">
              Internal note
            </label>
            <textarea id="support-note" value={note} maxLength={4000} rows={3} className="w-full rounded-2xl border border-dashed border-gold-600 px-3 py-2" onChange={(event) => setNote(event.target.value)} />
            <p className="text-xs text-ink-500">Customers never see internal notes.</p>
            <Button type="submit" size="sm" variant="outline">
              Save internal note
            </Button>
          </form>
        </div>
        <aside className="space-y-4 rounded-3xl bg-cream-100 p-4">
          <h2 className="font-display text-2xl text-forest-800">Account</h2>
          {account ? (
            <>
              <p className="font-semibold text-forest-800">{name || "Signed-in user"}</p>
              <p className="text-sm text-ink-700">Role: {account.role ?? "Unknown"}</p>
              <p className="text-sm text-ink-700">{account.email}</p>
              {account.profileHref ? (
                <Link className="font-semibold text-forest-800 underline" to={account.profileHref}>
                  Open contractor profile
                </Link>
              ) : (
                <p className="text-sm text-ink-500">No contractor profile link.</p>
              )}
              {account.businessName ? <p className="text-sm text-ink-700">Admin only: {account.businessName}</p> : null}
            </>
          ) : (
            <p className="text-sm text-ink-700">Guest. No account is attached.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <Button key={status} type="button" size="sm" variant={conversation?.status === status ? "primary" : "ghost"} onClick={() => void run(() => setSupportStatus(conversationId, status), null)}>
                {statusLabel(status)}
              </Button>
            ))}
          </div>
          <label className="block text-sm font-semibold text-forest-800">
            Priority
            <select
              className="mt-1 min-h-12 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3"
              value={conversation?.priority ?? "NORMAL"}
              onChange={(event) => void run(() => setSupportPriority(conversationId, event.target.value), null)}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="gold" onClick={() => void run(() => takeoverSupport(conversationId), null)}>
            Take over
          </Button>
        </aside>
      </div>
    </div>
  );
}

export function AdminSupportKnowledgePage() {
  const [articles, setArticles] = useState<SupportArticle[]>([]);
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [cannedId, setCannedId] = useState<string | null>(null);
  const [cannedTitle, setCannedTitle] = useState("");
  const [cannedBody, setCannedBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    void listSupportArticles()
      .then((rows) => {
        if (!stop) setArticles(rows);
      })
      .catch((err: unknown) => {
        if (!stop) setError(err instanceof Error ? err.message : "Could not load articles.");
      });
    void listCannedResponses()
      .then((rows) => {
        if (!stop) setCanned(rows);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  function editArticle(article: SupportArticle) {
    setArticleId(article.id);
    setTitle(article.title);
    setSlug(article.slug);
    setBody(article.body);
    setStatus(article.status);
  }

  return (
    <div className="space-y-8">
      <PageIntro title="Knowledge" body="Articles and canned responses are plain text or Markdown. Raw HTML is rejected." />
      <FormError message={error} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ul className="space-y-2">
          {articles.map((article) => (
            <li key={article.id}>
              <button type="button" className="w-full rounded-2xl bg-cream-100 px-3 py-2 text-left text-sm font-semibold text-forest-800" onClick={() => editArticle(article)}>
                {article.title}
                <span className="mt-1 block text-xs font-normal text-ink-500">{article.status}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveSupportArticle({ id: articleId, title, body, status, slug })
              .then((rows) => {
                setArticles(rows);
                setError(null);
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save that article."));
          }}
        >
          <label className="block text-sm font-semibold text-forest-800" htmlFor="kb-title">
            Title
            <input id="kb-title" value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-forest-800/15 px-3" />
          </label>
          <label className="block text-sm font-semibold text-forest-800" htmlFor="kb-slug">
            Slug
            <input id="kb-slug" value={slug} onChange={(event) => setSlug(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-forest-800/15 px-3" />
          </label>
          <label className="block text-sm font-semibold text-forest-800" htmlFor="kb-body">
            Article body
            <textarea id="kb-body" value={body} onChange={(event) => setBody(event.target.value)} rows={10} className="mt-1 w-full rounded-2xl border border-forest-800/15 px-3 py-2" />
          </label>
          <label className="block text-sm font-semibold text-forest-800" htmlFor="kb-status">
            Status
            <select id="kb-status" value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3">
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">
              Save article
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setArticleId(null);
                setTitle("");
                setSlug("");
                setBody("");
                setStatus("DRAFT");
              }}
            >
              New article
            </Button>
          </div>
        </form>
      </div>
      <section className="space-y-3">
        <h2 className="font-display text-2xl text-forest-800">Canned responses</h2>
        <ul className="space-y-2">
          {canned.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="text-left text-sm font-semibold text-forest-800 underline"
                onClick={() => {
                  setCannedId(item.id);
                  setCannedTitle(item.title);
                  setCannedBody(item.body);
                }}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveCannedResponse({ id: cannedId, title: cannedTitle, body: cannedBody })
              .then((rows) => {
                setCanned(rows);
                setError(null);
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save that response."));
          }}
        >
          <label className="block text-sm font-semibold text-forest-800" htmlFor="canned-title">
            Response title
            <input id="canned-title" value={cannedTitle} onChange={(event) => setCannedTitle(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-forest-800/15 px-3" />
          </label>
          <label className="block text-sm font-semibold text-forest-800" htmlFor="canned-body">
            Response body
            <textarea id="canned-body" value={cannedBody} onChange={(event) => setCannedBody(event.target.value)} rows={4} className="mt-1 w-full rounded-2xl border border-forest-800/15 px-3 py-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">
              Save response
            </Button>
            {cannedId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void deleteCannedResponse(cannedId)
                    .then(() => setCanned((rows) => rows.filter((row) => row.id !== cannedId)))
                    .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not delete that response."));
                }}
              >
                Delete response
              </Button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "No first response yet";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} hr`;
}

export function AdminSupportAnalyticsPage() {
  const [report, setReport] = useState<SupportAnalytics | null>(null);
  const [retention, setRetention] = useState("365");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let stop = false;
    void supportAnalytics(30)
      .then((next) => {
        if (!stop) setReport(next);
      })
      .catch((err: unknown) => {
        if (!stop) setError(err instanceof Error ? err.message : "Could not load support analytics.");
      });
    return () => {
      stop = true;
    };
  }, []);

  const max = Math.max(1, ...(report?.byDay.map((day) => day.opened) ?? [1]));

  return (
    <div className="space-y-6">
      <PageIntro title="Analytics" body="Volume and first-response time for ticketed conversations. Day buckets use America/Chicago." />
      <FormError message={error} />
      {notice ? <p role="status">{notice}</p> : null}
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-cream-100 p-4">
          <dt className="text-sm text-ink-500">Opened</dt>
          <dd className="font-display text-3xl text-forest-800">{report?.opened ?? 0}</dd>
        </div>
        <div className="rounded-3xl bg-cream-100 p-4">
          <dt className="text-sm text-ink-500">With a first response</dt>
          <dd className="font-display text-3xl text-forest-800">{report?.withFirstResponse ?? 0}</dd>
        </div>
        <div className="rounded-3xl bg-cream-100 p-4">
          <dt className="text-sm text-ink-500">Median first response</dt>
          <dd className="font-display text-3xl text-forest-800">{formatDuration(report?.medianFirstResponseSeconds ?? null)}</dd>
        </div>
      </dl>
      <svg viewBox="0 0 320 120" role="img" aria-label="Opened tickets by day" className="h-32 w-full max-w-xl">
        {(report?.byDay ?? []).map((day, index) => {
          const width = 320 / Math.max(report?.byDay.length ?? 1, 1);
          const height = (day.opened / max) * 110;
          return <rect key={day.day} x={index * width} y={120 - height} width={Math.max(width - 2, 1)} height={height} fill="#1a3c2e" />;
        })}
      </svg>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Opened tickets by day</caption>
        <thead>
          <tr>
            <th className="py-2">Day</th>
            <th className="py-2">Opened</th>
          </tr>
        </thead>
        <tbody>
          {(report?.byDay ?? []).map((day) => (
            <tr key={day.day} className="border-t border-forest-800/10">
              <td className="py-2">{day.day}</td>
              <td className="py-2">{day.opened}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void setSupportRetention(Number(retention))
            .then((days) => setNotice(`Retention is ${days} days. Nothing is deleted until you purge.`))
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save retention."));
        }}
      >
        <label htmlFor="support-retention" className="text-sm font-semibold text-forest-800">
          Keep resolved and closed conversations (days)
          <input id="support-retention" value={retention} onChange={(event) => setRetention(event.target.value)} inputMode="numeric" className="mt-1 min-h-12 w-32 rounded-2xl border border-forest-800/15 px-3" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            Save retention
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void purgeExpiredSupport()
                .then((count) => setNotice(`Purged ${count} expired conversations. This is not on a schedule.`))
                .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not purge."));
            }}
          >
            Purge expired
          </Button>
        </div>
        <p className="text-xs text-ink-500">Purge deletes resolved and closed tickets older than the retention window. It does not run unless you click it.</p>
      </form>
    </div>
  );
}

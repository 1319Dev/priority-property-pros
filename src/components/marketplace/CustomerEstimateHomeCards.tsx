import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMyNotifications, markNotificationRead, type InAppNotificationRow } from "../../lib/marketplace/api";
import { customerNotificationHref } from "../../lib/marketplace/notifications";

export function CustomerEstimateHomeCards() {
  const [rows, setRows] = useState<InAppNotificationRow[]>([]);

  useEffect(() => {
    let stop = false;
    void fetchMyNotifications()
      .then((next) => {
        if (stop) return;
        const estimates = next
          .filter((row) => row.kind.startsWith("estimate."))
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setRows(estimates);
      })
      .catch(() => {
        if (!stop) setRows([]);
      });
    return () => {
      stop = true;
    };
  }, []);

  const visible = rows.slice(0, 5);
  if (visible.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Estimate updates">
      <ul className="space-y-2">
        {visible.map((row) => {
          const href = customerNotificationHref({
            kind: row.kind,
            entityId: row.entity_id,
            payload: row.payload,
          });
          const className = `block w-full rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-left text-sm ${
            row.read_at ? "font-normal text-ink-700" : "font-semibold text-forest-800"
          }`;
          const markRead = () => {
            if (row.read_at) return;
            void markNotificationRead(row.id)
              .then(() => {
                setRows((current) =>
                  current.map((item) => (item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item)),
                );
              })
              .catch(() => undefined);
          };
          return (
            <li key={row.id}>
              {href ? (
                <Link to={href} className={className} onClick={markRead}>
                  <span className="block text-forest-800">{row.title}</span>
                  <span className="mt-1 block font-normal text-ink-700">{row.body}</span>
                </Link>
              ) : (
                <button type="button" className={className} onClick={markRead}>
                  <span className="block text-forest-800">{row.title}</span>
                  <span className="mt-1 block font-normal text-ink-700">{row.body}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

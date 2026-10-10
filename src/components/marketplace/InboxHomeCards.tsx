import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { JobReference } from "./JobReference";
import { listMyMessageThreads } from "../../lib/marketplace/messagingApi";
import { messageNotificationHref, newMessageFromLabel, sortMessageThreads } from "../../lib/marketplace/messaging";

export function InboxHomeCards({ role }: { role: "customer" | "contractor" }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMyMessageThreads>>>([]);

  useEffect(() => {
    let stop = false;
    void listMyMessageThreads()
      .then((next) => {
        if (!stop) setRows(next);
      })
      .catch(() => {
        if (!stop) setRows([]);
      });
    return () => {
      stop = true;
    };
  }, []);

  const unread = sortMessageThreads(rows).filter((row) => row.unread_count > 0);
  if (unread.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="New messages">
      <ul className="space-y-2">
        {unread.slice(0, 3).map((row) => {
          const href = messageNotificationHref(role, {
            project_id: row.project_id,
            contractor_profile_id: row.contractor_profile_id,
            booking_id: row.booking_id,
          });
          if (!href) return null;
          const name = row.other_party_label || (role === "customer" ? row.contractor_label : "Customer");
          return (
            <li key={`${row.project_id}:${row.contractor_profile_id}`}>
              <Link
                to={href}
                className="block rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm font-semibold text-forest-800"
              >
                {newMessageFromLabel(name)}
                <span className="mt-1 block font-normal text-ink-700">{row.project_title}</span>
                <JobReference value={row.project_reference_number} copy={false} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

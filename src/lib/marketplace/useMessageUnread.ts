import { useEffect, useState } from "react";
import { listMyMessageThreads } from "./messagingApi";

const POLL_MS = 12_000;

export function useMessageUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void listMyMessageThreads()
        .then((rows) => {
          if (stop) return;
          setCount(rows.reduce((sum, row) => sum + (row.unread_count > 0 ? row.unread_count : 0), 0));
        })
        .catch(() => {
          if (!stop) setCount(0);
        });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  return count;
}

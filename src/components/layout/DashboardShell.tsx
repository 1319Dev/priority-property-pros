import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "../brand/Logo";
import { AccountMenu } from "../account/AccountMenu";
import { NotificationBell } from "../notifications/NotificationBell";
import { useAuth } from "../../lib/auth/useAuth";
import { displayName } from "../../lib/auth/roles";
import { SUPPORT_EMAIL } from "../../data/brand";

export type DashNavItem = {
  to: string;
  label: string;
  end?: boolean;
  prominent?: boolean;
  badge?: number;
};

export function DashboardShell({
  items,
  eyebrow,
  notice,
  children,
}: {
  items: DashNavItem[];
  eyebrow: string;
  notice?: ReactNode;
  children?: ReactNode;
}) {
  const { profile, account_status } = useAuth();
  const name = profile ? displayName(profile.first_name, profile.last_name, profile.email) : "";

  return (
    <div className="paper-grain flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-forest-800/10 bg-cream-50/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex min-h-16 w-full min-w-0 max-w-6xl items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <NavLink to="/" aria-label="Priority Property Pros home" className="inline-flex min-h-11 min-w-0 shrink items-center">
              <Logo truncateWordmark />
            </NavLink>
            <nav aria-label="Dashboard" className="hidden min-w-0 lg:block">
              <ul className="flex flex-wrap items-center gap-1">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold ${
                          isActive ? "bg-forest-800 text-cream-50" : "text-forest-800 hover:bg-cream-100"
                        }`
                      }
                    >
                      <NavLabel item={item} />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            <p className="hidden min-w-0 max-w-[7rem] truncate text-xs text-ink-700 min-[420px]:block sm:max-w-none sm:text-sm">
              {eyebrow}
              {name ? ` · ${name}` : ""}
            </p>
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>
      {account_status === "PENDING" ? (
        <div className="bg-gold-500/20 px-4 py-2 text-center text-sm text-forest-950">
          This account is pending review or email confirmation. You can look around; matching waits on an active, approved contractor.
        </div>
      ) : null}
      {notice ? <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">{notice}</div> : null}
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-10">
        {children ?? <Outlet />}
      </main>
      <p className="mx-auto w-full max-w-6xl break-words px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] text-sm text-ink-500 sm:px-6 lg:pb-6">
        <a className="font-semibold text-forest-800 underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </p>
      <nav
        aria-label="Dashboard"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-forest-800/10 bg-cream-50/95 pb-safe backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto flex w-full max-w-3xl px-1 pt-1">
          {items.map((item) => (
            <li key={item.to} className="min-w-0 flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-center text-[0.65rem] font-semibold leading-none ${
                    isActive ? "text-forest-800" : "text-ink-500"
                  }`
                }
              >
                <DashIcon label={item.label} />
                <NavLabel item={item} compact />
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavLabel({ item, compact = false }: { item: DashNavItem; compact?: boolean }) {
  const showBadge = typeof item.badge === "number" && item.badge > 0;
  const badgeText = showBadge && item.badge! > 99 ? "99+" : String(item.badge ?? "");
  return (
    <span className={`inline-flex max-w-full items-center ${compact ? "flex-col gap-0.5" : "gap-2"}`}>
      <span className={compact ? "max-w-full truncate" : ""}>{item.label}</span>
      {showBadge ? (
        <span
          className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-xs font-bold text-forest-950"
          aria-label={`${item.badge} pending`}
        >
          {badgeText}
        </span>
      ) : null}
    </span>
  );
}

function DashIcon({ label }: { label: string }) {
  const key = label.toLowerCase();
  const path =
    key === "home" || key === "overview"
      ? "M4 11.5 12 5l8 6.5V20h-5v-6H9v6H4Z"
      : key === "jobs" || key === "projects" || key === "bookings"
        ? "M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h4"
        : key === "messages"
          ? "M5 6h14v9H8l-3 3z"
          : key === "estimates" || key === "reviews"
            ? "M7 4h8l3 3v13H7z M9 12h6 M9 16h4"
            : key === "profile" || key === "account" || key === "people"
              ? "M12 8a3 3 0 1 0 0.01 0 M6 19c1.4-2.6 3.4-4 6-4s4.6 1.4 6 4"
              : "M5 7h14 M5 12h14 M5 17h10";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-forest-800/20 bg-cream-100 px-6 py-12 text-center">
      <h2 className="font-display text-2xl font-semibold text-forest-800">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-ink-700">{body}</p>
    </div>
  );
}

import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "../brand/Logo";
import { useAuth } from "../../lib/auth/useAuth";
import { displayName } from "../../lib/auth/roles";

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
}: {
  items: DashNavItem[];
  eyebrow: string;
}) {
  const { profile, account_status } = useAuth();
  const name = profile ? displayName(profile.first_name, profile.last_name, profile.email) : "";

  return (
    <div className="paper-grain flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-forest-800/10 bg-cream-50/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <NavLink to="/" aria-label="Priority Property Pros home">
            <Logo />
          </NavLink>
          <p className="hidden text-sm text-ink-700 sm:block">
            {eyebrow}
            {name ? ` · ${name}` : ""}
          </p>
        </div>
      </header>
      {account_status === "PENDING" ? (
        <div className="bg-gold-500/20 px-4 py-2 text-center text-sm text-forest-950">
          This account is pending review or email confirmation. You can look around; matching waits on an active, approved contractor.
        </div>
      ) : null}
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-32 sm:px-6 lg:pb-10">
        <Outlet />
      </main>
      <nav
        aria-label="Dashboard"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-forest-800/10 bg-cream-50/95 pb-safe backdrop-blur-md lg:static lg:border-t-0"
      >
        <ul
          className="mx-auto grid max-w-lg px-2 pt-1 lg:hidden"
          style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, minmax(0, 1fr))` }}
        >
          {items.slice(0, 5).map((item) => (
            <li key={item.to} className="flex justify-center">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-12 min-w-12 flex-col items-center justify-center px-2 py-1 text-[0.65rem] font-semibold ${
                    isActive ? "text-forest-800" : "text-ink-500"
                  }`
                }
              >
                <NavLabel item={item} compact />
              </NavLink>
            </li>
          ))}
        </ul>
        <ul className="mx-auto hidden max-w-6xl gap-2 px-6 py-3 lg:flex">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
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
  );
}

function NavLabel({ item, compact = false }: { item: DashNavItem; compact?: boolean }) {
  const showBadge = typeof item.badge === "number" && item.badge > 0;
  const badgeText = showBadge && item.badge! > 99 ? "99+" : String(item.badge ?? "");
  return (
    <span className={`inline-flex items-center ${compact ? "flex-col gap-0.5" : "gap-2"}`}>
      <span>{item.label}</span>
      {showBadge ? (
        <span
          className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-[0.62rem] font-bold text-forest-950"
          aria-label={`${item.badge} pending`}
        >
          {badgeText}
        </span>
      ) : null}
    </span>
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

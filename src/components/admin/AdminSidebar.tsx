import { NavLink } from "react-router-dom";
import { BrandMark } from "../brand/Logo";
import { AdminIcon } from "./AdminIcon";
import { ADMIN_NAV_GROUPS, adminNavByGroup, type AdminNavItem } from "./adminNav";

export function AdminSidebar({
  pendingApprovals,
  onNavigate,
  id,
  variant = "rail",
}: {
  pendingApprovals: number;
  onNavigate?: () => void;
  id?: string;
  /** rail: icon-only until the desktop breakpoint. drawer: labels always on. */
  variant?: "rail" | "drawer";
}) {
  const drawer = variant === "drawer";
  return (
    <div id={id} className="flex h-full min-h-0 flex-col">
      <NavLink
        to="/app/admin"
        end
        aria-label="Admin overview"
        onClick={onNavigate}
        className="flex min-h-16 items-center px-3 lg:px-5"
      >
        <span className="inline-flex items-center gap-2.5">
          <span className="rounded-xl bg-cream-50 p-1">
            <BrandMark className="h-8 w-8" />
          </span>
          <span className={drawer ? "flex flex-col leading-none" : "hidden flex-col leading-none lg:flex"}>
            <span className="font-display text-xs font-semibold tracking-[0.18em] text-gold-300">PRIORITY</span>
            <span className="font-display text-base font-semibold tracking-tight text-cream-50">Property Pros</span>
          </span>
        </span>
      </NavLink>
      <nav aria-label="Admin" className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 lg:px-3">
        {ADMIN_NAV_GROUPS.map((group) => {
          const items = adminNavByGroup(group);
          if (items.length === 0) return null;
          return (
            <div key={group} className={group === "Overview" ? "" : "mt-4"}>
              {group === "Overview" ? null : (
                <p className={`${drawer ? "block" : "hidden lg:block"} px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-gold-300`}>
                  {group}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.id}>
                    <SidebarLink
                      item={item}
                      pendingApprovals={pendingApprovals}
                      onNavigate={onNavigate}
                      variant={variant}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarLink({
  item,
  pendingApprovals,
  onNavigate,
  variant,
}: {
  item: AdminNavItem;
  pendingApprovals: number;
  onNavigate?: () => void;
  variant: "rail" | "drawer";
}) {
  const badge = item.id === "approvals" ? pendingApprovals : 0;
  const showBadge = badge > 0;
  const badgeText = badge > 99 ? "99+" : String(badge);
  const showLabel = variant === "drawer";
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      aria-label={showBadge ? `${item.label}, ${badge} pending` : item.label}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold ${
          isActive ? "bg-cream-50 text-forest-800" : "text-cream-50 hover:bg-cream-50/10"
        }`
      }
    >
      <span className="relative inline-flex shrink-0">
        <AdminIcon name={item.icon} className="h-5 w-5" />
        {showBadge && !showLabel ? (
          <span
            className="absolute -right-2 -top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1 text-[0.65rem] font-bold text-forest-950 lg:hidden"
            aria-label={`${badge} pending`}
          >
            {badgeText}
          </span>
        ) : null}
      </span>
      <span className={showLabel ? "min-w-0 flex-1 truncate" : "hidden min-w-0 flex-1 truncate lg:inline"}>
        {item.label}
      </span>
      {showBadge ? (
        <span
          className={`${showLabel ? "inline-flex" : "hidden lg:inline-flex"} ml-auto min-h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-xs font-bold text-forest-950`}
          aria-label={`${badge} pending`}
        >
          {badgeText}
        </span>
      ) : null}
    </NavLink>
  );
}

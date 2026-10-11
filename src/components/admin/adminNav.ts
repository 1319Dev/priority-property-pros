import { formatProjectReference, parseProjectReference } from "../../lib/marketplace/projectReference";
import type { AdminIconName } from "./AdminIcon";

/**
 * Working admin sections only. A later section adds its own file under
 * ./sections and is picked up here. Empty groups stay out of the sidebar.
 */
export const ADMIN_NAV_GROUPS = ["Overview", "People", "Marketplace", "Money", "Trust", "Account"] as const;

export type AdminNavGroup = (typeof ADMIN_NAV_GROUPS)[number];

export type AdminNavItem = {
  id: string;
  to: string;
  label: string;
  icon: AdminIconName;
  group: AdminNavGroup;
  /** Sort key inside the whole nav. Lower comes first. */
  order: number;
  end?: boolean;
  /** Last breadcrumb when the path has another segment. */
  detailCrumb?: string;
  /** Extra words the top-bar search should match. */
  searchAliases: string[];
};

const BUILTIN_NAV: readonly AdminNavItem[] = [
  {
    id: "overview",
    to: "/app/admin",
    label: "Overview",
    icon: "overview",
    group: "Overview",
    order: 0,
    end: true,
    searchAliases: ["overview", "dashboard", "home"],
  },
  {
    id: "approvals",
    to: "/app/admin/approvals",
    label: "Approvals",
    icon: "approvals",
    group: "Marketplace",
    order: 50,
    detailCrumb: "Application",
    searchAliases: ["approvals", "contractors", "portfolio", "photos"],
  },
  {
    id: "reviews",
    to: "/app/admin/reviews",
    label: "Reviews",
    icon: "reviews",
    group: "Marketplace",
    order: 60,
    searchAliases: ["reviews", "testimonials", "platform reviews"],
  },
  {
    id: "bookings",
    to: "/app/admin/bookings",
    label: "Booking tools",
    icon: "bookings",
    group: "Marketplace",
    order: 70,
    searchAliases: ["bookings", "booking tools", "jobs", "contact access"],
  },
  {
    id: "security",
    to: "/app/admin/security",
    label: "Two-factor",
    icon: "security",
    group: "Trust",
    order: 80,
    searchAliases: ["two-factor", "two factor", "2fa", "security", "mfa", "authenticator"],
  },
  {
    id: "audit",
    to: "/app/admin/audit",
    label: "Audit log",
    icon: "audit",
    group: "Trust",
    order: 85,
    searchAliases: ["audit", "audit log", "activity"],
  },
  {
    id: "account",
    to: "/app/admin/account",
    label: "Account",
    icon: "account",
    group: "Account",
    order: 90,
    searchAliases: ["account", "profile", "my admin account"],
  },
];

type NavModule = {
  adminNavSection?: {
    items: readonly AdminNavItem[];
  };
};

const navModules = import.meta.glob("./sections/*/nav.ts", { eager: true }) as Record<string, NavModule>;

function extensionItems(): AdminNavItem[] {
  return Object.keys(navModules)
    .sort()
    .flatMap((key) => navModules[key]?.adminNavSection?.items ?? []);
}

export const ADMIN_NAV: readonly AdminNavItem[] = [...BUILTIN_NAV, ...extensionItems()].sort(
  (a, b) => a.order - b.order || a.label.localeCompare(b.label),
);

export function adminNavByGroup(group: AdminNavGroup): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => item.group === group);
}

export type AdminCrumb = {
  label: string;
  to?: string;
};

export function adminBreadcrumbs(pathname: string): AdminCrumb[] {
  const path = pathname.replace(/\/+$/, "") || "/app/admin";
  if (path === "/app/admin") return [{ label: "Overview" }];

  const crumbs: AdminCrumb[] = [{ label: "Overview", to: "/app/admin" }];
  const rest = path.startsWith("/app/admin/") ? path.slice("/app/admin/".length) : "";
  const [section, extra] = rest.split("/");
  const item = ADMIN_NAV.find((entry) => entry.to === `/app/admin/${section}`);

  if (section === "account" && extra === "notifications") {
    crumbs.push({ label: "Account", to: "/app/admin/account" });
    crumbs.push({ label: "Notifications" });
    return crumbs;
  }

  if (item && extra) {
    crumbs.push({ label: item.label, to: item.to });
    crumbs.push({ label: item.detailCrumb ?? "Detail" });
    return crumbs;
  }

  if (item) {
    crumbs.push({ label: item.label });
    return crumbs;
  }

  crumbs.push({ label: "Admin" });
  return crumbs;
}

export type AdminSearchHit =
  | { type: "section"; id: string; label: string; to: string }
  | { type: "job"; id: string; label: string; to: string; reference: string };

export function adminSearchHits(query: string): AdminSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: AdminSearchHit[] = [];
  const referenceNumber = parseProjectReference(query);
  if (referenceNumber != null) {
    const reference = formatProjectReference(referenceNumber);
    if (reference) {
      hits.push({
        type: "job",
        id: `job-${reference}`,
        label: `Open job ${reference}`,
        reference,
        to: `/app/admin/bookings?ref=${encodeURIComponent(reference)}`,
      });
    }
  }

  for (const item of ADMIN_NAV) {
    const haystack = [item.label, ...item.searchAliases].map((value) => value.toLowerCase());
    if (haystack.some((value) => value.includes(q))) {
      hits.push({ type: "section", id: item.id, label: item.label, to: item.to });
    }
  }
  return hits;
}

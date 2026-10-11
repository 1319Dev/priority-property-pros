import { formatProjectReference, parseProjectReference } from "../../lib/marketplace/projectReference";
import type { AdminIconName } from "./AdminIcon";

/**
 * Working admin sections only. People, Audit, and Payments stay out of the
 * nav until they have a real page.
 */
export type AdminNavItem = {
  id: string;
  to: string;
  label: string;
  icon: AdminIconName;
  group: "Overview" | "Marketplace" | "Trust" | "System";
  end?: boolean;
  /** Extra words the top-bar search should match. */
  searchAliases: string[];
};

export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    id: "overview",
    to: "/app/admin",
    label: "Overview",
    icon: "overview",
    group: "Overview",
    end: true,
    searchAliases: ["overview", "dashboard", "home"],
  },
  {
    id: "approvals",
    to: "/app/admin/approvals",
    label: "Approvals",
    icon: "approvals",
    group: "Marketplace",
    searchAliases: ["approvals", "contractors", "portfolio", "photos"],
  },
  {
    id: "reviews",
    to: "/app/admin/reviews",
    label: "Reviews",
    icon: "reviews",
    group: "Marketplace",
    searchAliases: ["reviews", "testimonials", "platform reviews"],
  },
  {
    id: "bookings",
    to: "/app/admin/bookings",
    label: "Booking tools",
    icon: "bookings",
    group: "Marketplace",
    searchAliases: ["bookings", "booking tools", "jobs", "contact access"],
  },
  {
    id: "support",
    to: "/app/admin/support",
    label: "Support",
    icon: "support",
    group: "Trust",
    searchAliases: ["support", "priority help", "tickets", "knowledge", "analytics"],
  },
  {
    id: "security",
    to: "/app/admin/security",
    label: "Two-factor",
    icon: "security",
    group: "Trust",
    searchAliases: ["two-factor", "two factor", "2fa", "security", "mfa", "authenticator"],
  },
  {
    id: "account",
    to: "/app/admin/account",
    label: "Account",
    icon: "account",
    group: "System",
    searchAliases: ["account", "profile"],
  },
];

export const ADMIN_NAV_GROUPS = ["Overview", "Marketplace", "Trust", "System"] as const;

export function adminNavByGroup(group: AdminNavItem["group"]): AdminNavItem[] {
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

  if (section === "support" && (extra === "kb" || extra === "analytics")) {
    crumbs.push({ label: "Support", to: "/app/admin/support" });
    crumbs.push({ label: extra === "kb" ? "Knowledge" : "Analytics" });
    return crumbs;
  }

  if (section === "support" && extra) {
    crumbs.push({ label: "Support", to: "/app/admin/support" });
    crumbs.push({ label: "Conversation" });
    return crumbs;
  }

  if (section === "account" && extra === "notifications") {
    crumbs.push({ label: "Account", to: "/app/admin/account" });
    crumbs.push({ label: "Notifications" });
    return crumbs;
  }

  if (item && extra) {
    crumbs.push({ label: item.label, to: item.to });
    if (section === "approvals") crumbs.push({ label: "Application" });
    else crumbs.push({ label: "Detail" });
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

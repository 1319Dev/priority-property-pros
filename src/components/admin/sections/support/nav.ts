import type { AdminNavItem } from "../../adminNav";

export const adminNavSection: { items: readonly AdminNavItem[] } = {
  items: [
    {
      id: "support",
      to: "/app/admin/support",
      label: "Support",
      icon: "support",
      group: "Trust",
      order: 75,
      searchAliases: ["support", "priority help", "tickets", "knowledge", "analytics"],
    },
  ],
};

import type { AdminNavItem } from "../../adminNav";

export const adminNavSection: { items: readonly AdminNavItem[] } = {
  items: [
    {
      id: "payments",
      to: "/app/admin/payments",
      label: "Payments",
      icon: "payments",
      group: "Money",
      order: 40,
      searchAliases: ["payments", "activation", "connect"],
    },
  ],
};

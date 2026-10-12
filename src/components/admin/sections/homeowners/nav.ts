import type { AdminNavItem } from "../../adminNav";

export const adminNavSection: { items: readonly AdminNavItem[] } = {
  items: [
    {
      id: "homeowners",
      to: "/app/admin/homeowners",
      label: "Homeowners",
      icon: "homeowners",
      group: "People",
      order: 10,
      detailCrumb: "Homeowner",
      searchAliases: ["homeowners", "customers", "people"],
    },
  ],
};

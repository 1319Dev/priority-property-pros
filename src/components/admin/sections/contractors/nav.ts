import type { AdminNavItem } from "../../adminNav";

export const adminNavSection: { items: readonly AdminNavItem[] } = {
  items: [
    {
      id: "contractors",
      to: "/app/admin/contractors",
      label: "Contractors",
      icon: "contractors",
      group: "People",
      order: 20,
      detailCrumb: "Contractor",
      searchAliases: ["contractors", "pros", "businesses"],
    },
  ],
};

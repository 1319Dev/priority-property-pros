import type { AdminNavItem } from "../../adminNav";

export const adminNavSection: { items: readonly AdminNavItem[] } = {
  items: [
    {
      id: "projects",
      to: "/app/admin/projects",
      label: "Projects",
      icon: "projects",
      group: "Marketplace",
      order: 30,
      detailCrumb: "Project",
      searchAliases: ["projects", "jobs list"],
    },
  ],
};

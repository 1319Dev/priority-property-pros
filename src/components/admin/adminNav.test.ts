import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV, adminBreadcrumbs, adminSearchHits } from "./adminNav";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("admin nav config", () => {
  const app = readFileSync(path.join(repoRoot, "src/App.tsx"), "utf8");

  it("only lists sections that have a route in the admin bundle", () => {
    expect(ADMIN_NAV.map((item) => item.to)).toEqual([
      "/app/admin",
      "/app/admin/approvals",
      "/app/admin/reviews",
      "/app/admin/contact",
      "/app/admin/bookings",
      "/app/admin/security",
      "/app/admin/account",
    ]);
    expect(app).toContain('path="approvals"');
    expect(app).toContain('path="reviews"');
    expect(app).toContain('path="contact"');
    expect(app).toContain('path="bookings"');
    expect(app).toContain('path="security"');
    expect(app).toContain('path="account"');
    expect(app).not.toMatch(/path="people"/);
    expect(app).not.toMatch(/path="audit"/);
  });

  it("keeps the admin route tree out of the public bundle entry", () => {
    expect(app).toMatch(/lazy\(\(\) => import\("\.\/pages\/app\/AdminShell"\)/);
    expect(app).toMatch(/lazy\(\(\) => import\("\.\/pages\/app\/AdminPages"\)/);
    expect(app).not.toMatch(/^import \{ AdminShell \}/m);
    expect(app).not.toMatch(/from "\.\/pages\/app\/AdminPages"/);
  });

  it("builds breadcrumbs from the current admin path", () => {
    expect(adminBreadcrumbs("/app/admin")).toEqual([{ label: "Overview" }]);
    expect(adminBreadcrumbs("/app/admin/reviews")).toEqual([
      { label: "Overview", to: "/app/admin" },
      { label: "Reviews" },
    ]);
    expect(adminBreadcrumbs("/app/admin/contact/msg-1")).toEqual([
      { label: "Overview", to: "/app/admin" },
      { label: "Contact messages", to: "/app/admin/contact" },
      { label: "Detail" },
    ]);
    expect(adminBreadcrumbs("/app/admin/approvals/cp-1")).toEqual([
      { label: "Overview", to: "/app/admin" },
      { label: "Approvals", to: "/app/admin/approvals" },
      { label: "Application" },
    ]);
    expect(adminBreadcrumbs("/app/admin/account/notifications")).toEqual([
      { label: "Overview", to: "/app/admin" },
      { label: "Account", to: "/app/admin/account" },
      { label: "Notifications" },
    ]);
  });

  it("searches section names and PPP job numbers, and never offers unbuilt sections", () => {
    expect(adminSearchHits("rev").map((hit) => hit.label)).toEqual(["Reviews"]);
    expect(adminSearchHits("two").map((hit) => hit.label)).toContain("Two-factor");
    expect(adminSearchHits("PPP-1004")).toEqual([
      {
        type: "job",
        id: "job-PPP-1004",
        label: "Open job PPP-1004",
        reference: "PPP-1004",
        to: "/app/admin/bookings?ref=PPP-1004",
      },
    ]);
    expect(adminSearchHits("contact").map((hit) => hit.label)).toContain("Contact messages");
    expect(adminSearchHits("people").map((hit) => hit.label)).not.toContain("People");
    expect(adminSearchHits("audit")).toEqual([]);
    expect(adminSearchHits("")).toEqual([]);
  });
});

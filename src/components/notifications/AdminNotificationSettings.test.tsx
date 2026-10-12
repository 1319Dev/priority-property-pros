import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { signedInAuth } from "../../lib/auth/authFixture";
import { categoriesForAccount, categoryForKind } from "../../lib/notifications/policy";
import { NotificationSettings } from "./NotificationSettings";

function renderSettings(type: "ADMIN" | "CUSTOMER" | "CONTRACTOR") {
  return render(
    <AuthContext.Provider value={signedInAuth(type)}>
      <MemoryRouter>
        <NotificationSettings mode="preview" />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("admin notification settings", () => {
  it("shows admin alerts and hides homeowner and contractor alerts", () => {
    renderSettings("ADMIN");
    for (const label of [
      "New contractor applications",
      "New reports",
      "Disputes opened",
      "Payments flagged for refund",
      "Account",
    ]) {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
    for (const label of ["New jobs", "Estimates", "Change orders", "Connections", "Messages"]) {
      expect(screen.queryByRole("heading", { name: label })).not.toBeInTheDocument();
    }
  });

  it("never shows admin alerts to homeowners or contractors", () => {
    renderSettings("CUSTOMER");
    expect(screen.queryByRole("heading", { name: "Disputes opened" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "New jobs" })).not.toBeInTheDocument();
    expect(categoriesForAccount("CONTRACTOR")).toContain("new_job");
    expect(categoriesForAccount("CONTRACTOR").some((category) => category.startsWith("admin_"))).toBe(false);
  });

  it("maps the database alert kinds to the admin categories", () => {
    expect(categoryForKind("admin.application_submitted")).toBe("admin_applications");
    expect(categoryForKind("admin.report_received")).toBe("admin_reports");
    expect(categoryForKind("admin.dispute_opened")).toBe("admin_disputes");
    expect(categoryForKind("admin.refund_flagged")).toBe("admin_refunds");
    expect(categoryForKind("booking.completed")).toBe("booking");
  });
});

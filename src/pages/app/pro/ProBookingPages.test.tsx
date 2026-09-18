import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectContactSection } from "./ProBookingPages";
import { AdminContactAccessPanel } from "../AdminPages";
import type { BookingContactAccess } from "../../../lib/marketplace/types";

describe("Project Contact section", () => {
  it("shows a professional locked message with no empty contact fields", () => {
    render(<ProjectContactSection entitled={false} contact={null} />);
    expect(screen.getByRole("heading", { name: /project contact/i })).toBeInTheDocument();
    expect(screen.getByText(/project contact is locked/i)).toBeInTheDocument();
    expect(screen.queryByText(/^phone$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^street$/i)).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("shows street, phone, and email after entitlement", () => {
    render(
      <ProjectContactSection
        entitled
        contact={{ street: "12 Oak St", phone: "404-555-0100", email: "pat@example.com" }}
      />,
    );
    expect(screen.getByText("12 Oak St")).toBeInTheDocument();
    expect(screen.getByText("404-555-0100")).toBeInTheDocument();
    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/project contact is locked/i)).not.toBeInTheDocument();
  });
});

describe("Admin contact access panel", () => {
  const granted: BookingContactAccess = {
    booking_id: "b1",
    status: "ADMIN_OVERRIDE",
    granted_at: "2026-09-17T12:00:00.000Z",
    granted_by: "admin-1",
    grant_reason: "Customer asked for a walkthrough",
    grant_source: "ADMIN_OVERRIDE",
    revoked_at: null,
    created_at: "2026-09-17T11:00:00.000Z",
    updated_at: "2026-09-17T12:00:00.000Z",
  };

  it("shows LOCKED for a missing row and grant metadata after override", () => {
    const { rerender } = render(<AdminContactAccessPanel access={null} audit={[]} />);
    expect(screen.getByText(/LOCKED \(missing row — no access\)/)).toBeInTheDocument();
    rerender(
      <AdminContactAccessPanel
        access={granted}
        audit={[
          {
            id: "e1",
            event_type: "contact_access.granted",
            payload: { reason: "Customer asked for a walkthrough" },
            created_at: "2026-09-17T12:00:00.000Z",
          },
        ]}
      />,
    );
    expect(screen.getByText("ADMIN_OVERRIDE")).toBeInTheDocument();
    expect(screen.getByText(/granted by/i)).toBeInTheDocument();
    expect(screen.getByText("admin-1")).toBeInTheDocument();
    expect(screen.getAllByText(/Customer asked for a walkthrough/).length).toBeGreaterThan(0);
    expect(screen.getByText(/contact access\.granted/i)).toBeInTheDocument();
  });
});

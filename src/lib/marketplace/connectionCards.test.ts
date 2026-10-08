import { describe, expect, it } from "vitest";
import {
  customerBookingStatusLabel,
  customerConnectionStatusLabel,
  sanitizeConnectionCards,
} from "./connectionCards";

describe("customer connection cards", () => {
  it("labels a paid connection as connected and a requested one without fee jargon", () => {
    expect(customerConnectionStatusLabel("PAID")).toBe("Connected");
    expect(customerConnectionStatusLabel("COMPLETED")).toBe("Connected");
    expect(customerConnectionStatusLabel("PAYMENT_DISABLED")).toBe("Connection requested");
    expect(customerConnectionStatusLabel("PAYMENT_DISABLED")).not.toMatch(/\$4\.99|payment/i);
    expect(customerBookingStatusLabel("CONFIRMED")).toBe("Hired");
    expect(customerBookingStatusLabel("PENDING")).toBe("Selected");
    expect(customerBookingStatusLabel(null)).toBeNull();
  });

  it("keeps display fields and drops contact, business, and fee keys", () => {
    const cards = sanitizeConnectionCards([
      {
        connection_id: "c1",
        contractor_profile_id: "p1",
        display_name: "Oak Fence Co",
        connection_status: "PAID",
        booking_status: "CONFIRMED",
        can_message: true,
        business_name: "Secret LLC",
        phone: "615-555-0100",
        email: "pat@example.com",
        street_line1: "1 Main St",
        fee_cents: 499,
        payments_live: true,
        charges_live: true,
      },
      { connection_id: "", contractor_profile_id: "p2" },
    ]);
    expect(cards).toEqual([
      {
        connection_id: "c1",
        contractor_profile_id: "p1",
        display_name: "Oak Fence Co",
        connection_status: "PAID",
        booking_status: "CONFIRMED",
        can_message: true,
      },
    ]);
    expect(JSON.stringify(cards)).not.toMatch(/Secret LLC|615-555-0100|pat@example.com|1 Main St|fee_cents|payments_live/);
  });
});

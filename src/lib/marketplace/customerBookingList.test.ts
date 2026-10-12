import { describe, expect, it, vi } from "vitest";
import { loadCustomerBookingList } from "./customerBookingList";
import type { Project } from "./types";

const hired = { id: "b-1004", project_id: "p-1004", status: "IN_PROGRESS", customer_hired_at: "2026-10-05T00:00:00Z", contractor_hired_at: "2026-10-05T00:01:00Z" };
const project = { id: "p-1004", title: "Fence repair", reference_number: 1004 } as unknown as Project;

describe("homeowner Bookings list loader", () => {
  it("still lists a Hired (IN_PROGRESS) booking when the stale-request cleanup fails", async () => {
    const fetchBookings = vi.fn().mockResolvedValue([hired]);
    const result = await loadCustomerBookingList({
      expireStale: vi.fn().mockRejectedValue(new Error("Could not refresh expired bookings.")),
      fetchBookings,
      fetchProjects: vi.fn().mockResolvedValue([project]),
    });
    expect(fetchBookings).toHaveBeenCalledTimes(1);
    expect(result.bookings.map((row) => row.status)).toEqual(["IN_PROGRESS"]);
    expect(result.projects).toEqual([project]);
  });

  it("does not filter bookings by status", async () => {
    const rows = ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "DISPUTED", "CANCELLED"].map((status, i) => ({ id: `b${i}`, status }));
    const result = await loadCustomerBookingList({
      expireStale: vi.fn().mockResolvedValue(0),
      fetchBookings: vi.fn().mockResolvedValue(rows),
      fetchProjects: vi.fn().mockResolvedValue([]),
    });
    expect(result.bookings).toHaveLength(6);
  });

  it("keeps bookings when project titles fail, and reports a failed bookings read as an error", async () => {
    const titlesDown = await loadCustomerBookingList({
      expireStale: vi.fn().mockResolvedValue(0),
      fetchBookings: vi.fn().mockResolvedValue([hired]),
      fetchProjects: vi.fn().mockRejectedValue(new Error("down")),
    });
    expect(titlesDown).toEqual({ bookings: [hired], projects: [] });
    await expect(
      loadCustomerBookingList({
        expireStale: vi.fn().mockResolvedValue(0),
        fetchBookings: vi.fn().mockRejectedValue(new Error("Could not load bookings.")),
        fetchProjects: vi.fn().mockResolvedValue([]),
      }),
    ).rejects.toThrow("Could not load bookings.");
  });
});

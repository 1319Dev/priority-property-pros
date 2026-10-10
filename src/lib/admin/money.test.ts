import { describe, expect, it } from "vitest";
import { addIsoDays, formatCents, formatCentralTimestamp, sumCents, trendQuery } from "./money";

describe("admin revenue cents", () => {
  it("adds cents as integers and formats without float residue", () => {
    expect(sumCents([999, 499])).toBe(1498);
    expect(formatCents(sumCents([999, 499]))).toBe("$14.98");
    expect(formatCents(999)).toBe("$9.99");
    expect(formatCents(499)).toBe("$4.99");
    expect(formatCents(10)).toBe("$0.10");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(100)).toBe("$1.00");
    expect(formatCents(sumCents([2099, 1]))).toBe("$21.00");
    expect(formatCents(sumCents([1, 1, 1]))).toBe("$0.03");
    expect(formatCents(-1498)).toBe("-$14.98");
    expect(formatCents(null)).toBe("—");
    expect(formatCents(Number.NaN)).toBe("—");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
  });

  it("builds Chicago day and month ranges inside 366 days", () => {
    expect(addIsoDays("2026-10-10", -6)).toBe("2026-10-04");
    expect(addIsoDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(trendQuery("7d", "2026-10-10")).toEqual({ granularity: "day", from: "2026-10-04", to: "2026-10-10" });
    expect(trendQuery("30d", "2026-10-10")).toEqual({ granularity: "day", from: "2026-09-11", to: "2026-10-10" });
    expect(trendQuery("12m", "2026-10-10")).toEqual({ granularity: "month", from: "2025-11-01", to: "2026-10-10" });
  });

  it("formats an instant in Central time", () => {
    const label = formatCentralTimestamp("2026-10-10T22:31:00.000Z");
    expect(label).toMatch(/Oct 10/);
    expect(label).toMatch(/5:31/);
    expect(label).toMatch(/CT|CDT|CST/);
  });
});

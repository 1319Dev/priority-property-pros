import { describe, expect, it } from "vitest";
import { safeAuditSummary } from "./auditApi";

describe("audit log summary redaction", () => {
  it("keeps role and status labels", () => {
    expect(safeAuditSummary("CUSTOMER · rating 5")).toBe("CUSTOMER · rating 5");
    expect(safeAuditSummary("  PRIVATE  ")).toBe("PRIVATE");
    expect(safeAuditSummary("")).toBeNull();
  });

  it("drops contact, paths, and links", () => {
    expect(safeAuditSummary("secret@example.com")).toBeNull();
    expect(safeAuditSummary("call 555-0100")).toBeNull();
    expect(safeAuditSummary("private/photo.jpg")).toBeNull();
    expect(safeAuditSummary("https://pay.example/secret")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { returnPathFromLocation, safeReturnPath } from "./sessionReturn";

describe("safeReturnPath", () => {
  it("keeps an in-app path and its query", () => {
    expect(safeReturnPath("/app/customer/projects/1?tab=estimates")).toBe("/app/customer/projects/1?tab=estimates");
    expect(returnPathFromLocation("/app/pro/opportunities/abc", "?slot=2")).toBe("/app/pro/opportunities/abc?slot=2");
  });

  it("drops off-site targets and the sign-in page itself", () => {
    expect(safeReturnPath("https://evil.example/app/customer")).toBeNull();
    expect(safeReturnPath("//evil.example")).toBeNull();
    expect(safeReturnPath("/\\evil.example")).toBeNull();
    expect(safeReturnPath("/sign-in?next=https://evil.example")).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
});

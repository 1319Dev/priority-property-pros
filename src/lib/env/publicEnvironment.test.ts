import { describe, expect, it } from "vitest";
import {
  isStagingPublicEnvironment,
  normalizePublicEnvironment,
  STAGING_PREVIEW_BANNER_BODY,
  STAGING_PREVIEW_BANNER_LABEL,
} from "./publicEnvironment";

describe("public environment banner gate", () => {
  it("treats only VITE_PUBLIC_ENVIRONMENT=staging as staging/preview", () => {
    expect(isStagingPublicEnvironment("staging")).toBe(true);
    expect(isStagingPublicEnvironment(" STAGING ")).toBe(true);
    expect(isStagingPublicEnvironment("production")).toBe(false);
    expect(isStagingPublicEnvironment("preview")).toBe(false);
    expect(isStagingPublicEnvironment("")).toBe(false);
    expect(isStagingPublicEnvironment(undefined)).toBe(false);
    expect(normalizePublicEnvironment(" Staging ")).toBe("staging");
  });

  it("uses STAGING / PREVIEW copy that does not claim payments are live", () => {
    expect(STAGING_PREVIEW_BANNER_LABEL).toBe("STAGING / PREVIEW");
    expect(STAGING_PREVIEW_BANNER_BODY).toMatch(/not the production site/i);
    expect(STAGING_PREVIEW_BANNER_BODY).toMatch(/payments are not live/i);
  });
});

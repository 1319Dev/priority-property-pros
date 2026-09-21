import { describe, expect, it } from "vitest";
import { legacyRedirectTarget } from "./legacyRedirects";

describe("legacy WordPress path redirects", () => {
  it("maps /services and /about, with or without a trailing slash", () => {
    expect(legacyRedirectTarget("/services")).toBe("/#services");
    expect(legacyRedirectTarget("/services/")).toBe("/#services");
    expect(legacyRedirectTarget("/about")).toBe("/how-it-works");
    expect(legacyRedirectTarget("/about/")).toBe("/how-it-works");
    expect(legacyRedirectTarget("/contact")).toBeNull();
    expect(legacyRedirectTarget("/faq")).toBeNull();
  });
});

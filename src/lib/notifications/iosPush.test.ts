import { describe, expect, it } from "vitest";
import { shouldShowIosHomeScreenGuide } from "./iosPush";

const iphoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1";

describe("iPhone push guide", () => {
  it("shows the Home Screen guide for iOS Safari outside the installed app", () => {
    expect(
      shouldShowIosHomeScreenGuide({
        userAgent: iphoneSafari,
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: false,
      }),
    ).toBe(true);
  });

  it("hides the guide once the site is opened from the Home Screen", () => {
    expect(
      shouldShowIosHomeScreenGuide({
        userAgent: iphoneSafari,
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: true,
      }),
    ).toBe(false);
  });

  it("does not treat iOS Chrome or desktop Safari as the broken button", () => {
    expect(
      shouldShowIosHomeScreenGuide({
        userAgent: `${iphoneSafari} CriOS/120.0`,
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: false,
      }),
    ).toBe(false);
    expect(
      shouldShowIosHomeScreenGuide({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 0,
        standalone: false,
      }),
    ).toBe(false);
  });
});

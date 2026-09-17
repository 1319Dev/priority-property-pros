import { describe, expect, it } from "vitest";
import {
  CONTACT_AFTER_CONNECTION_COPY,
  detectContactLeak,
} from "./contactLeak";

describe("anti-circumvention contact detection", () => {
  it("allows ordinary estimate notes, bios, and timelines", () => {
    expect(detectContactLeak("Replace the fence boards on the back lot. Includes materials.").blocked).toBe(
      false,
    );
    expect(detectContactLeak("Serving 30318 and nearby ZIP codes. 8 years in business.").blocked).toBe(
      false,
    );
    expect(detectContactLeak("").blocked).toBe(false);
    expect(detectContactLeak(null).blocked).toBe(false);
  });

  it("blocks obvious phone, email, URL, and social handles", () => {
    expect(detectContactLeak("Call me at 404-555-0199 after you pick me.").kinds).toContain("phone");
    expect(detectContactLeak("Email the crew at crew@example.com").kinds).toContain("email");
    expect(detectContactLeak("See more at https://mycrew.example/jobs").kinds).toContain("url");
    expect(detectContactLeak("DM @fenceking404 on Instagram").kinds).toContain("handle");
    expect(detectContactLeak("Find us on facebook.com/peachtreepro").kinds).toContain("url");
  });

  it("uses the PPP connection copy instead of invasive wording", () => {
    const result = detectContactLeak("Text 404.555.0100");
    expect(result.blocked).toBe(true);
    expect(result.message).toBe(CONTACT_AFTER_CONNECTION_COPY);
    expect(CONTACT_AFTER_CONNECTION_COPY).toMatch(/after connection through PPP/i);
    expect(CONTACT_AFTER_CONNECTION_COPY).not.toMatch(/surveillance|keylogger|scan your device/i);
  });
});

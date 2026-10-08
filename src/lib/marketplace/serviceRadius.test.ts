import { describe, expect, it } from "vitest";
import { formatGeneralServiceArea } from "./publicDirectory";
import { haversineMiles } from "./matching";
import {
  chooseBaseZip,
  findingProsNearLabel,
  formatRadiusPreview,
  formatServesWithin,
  NO_PROS_IN_AREA_YET,
  sensibleRadiusMiles,
  validateServiceRadiusDraft,
} from "./serviceRadius";

describe("service radius copy and validation", () => {
  it("previews coverage and the public storefront phrase", () => {
    expect(formatRadiusPreview({ zipCount: 42, city: "Conroe", state: "TX" })).toBe(
      "Covers about 42 ZIP codes around Conroe, TX",
    );
    expect(formatServesWithin({ miles: 25, city: "Conroe", state: "TX" })).toBe(
      "Serves within 25 miles of Conroe, TX",
    );
    expect(formatGeneralServiceArea({ serviceArea: "Serves within 25 miles of Conroe, TX" })).toBe(
      "Serves within 25 miles of Conroe, TX",
    );
    expect(findingProsNearLabel("Conroe", "TX", "77301")).toBe("Finding pros near Conroe, TX");
    expect(NO_PROS_IN_AREA_YET).toMatch(/No pros in your area yet/);
    expect(NO_PROS_IN_AREA_YET).not.toMatch(/street/i);
  });

  it("rejects a short ZIP, a missing radius, and an unknown extra ZIP", () => {
    expect(validateServiceRadiusDraft({ centerZip: "7730", radiusMiles: "25", extraZips: "" }).ok).toBe(false);
    expect(validateServiceRadiusDraft({ centerZip: "77301", radiusMiles: "", extraZips: "" }).ok).toBe(false);
    expect(
      validateServiceRadiusDraft({ centerZip: "77301", radiusMiles: "500", extraZips: "" }).ok,
    ).toBe(false);
    const known = new Set(["77301", "77304"]);
    const unknown = validateServiceRadiusDraft({
      centerZip: "77301",
      radiusMiles: "25",
      extraZips: "99999",
      knownZips: known,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toMatch(/99999/);

    const ok = validateServiceRadiusDraft({
      centerZip: "77301-1234",
      radiusMiles: "25",
      extraZips: "77304, 77301",
      knownZips: known,
    });
    expect(ok).toEqual({
      ok: true,
      value: { centerZip: "77301", radiusMiles: 25, extraZips: ["77304"] },
    });
  });

  it("infers a base ZIP and the smallest covering radius without dropping farther ZIPs from the input", () => {
    expect(sensibleRadiusMiles(0)).toBe(5);
    expect(sensibleRadiusMiles(10)).toBe(10);
    expect(sensibleRadiusMiles(10.01)).toBe(25);
    expect(sensibleRadiusMiles(80)).toBe(100);
    expect(sensibleRadiusMiles(400)).toBe(150);

    const conroe = { zip: "77301", lat: 30.309853, lng: -95.43128 };
    const neighbor = { zip: "77304", lat: 30.32776, lng: -95.516045 };
    const houston = { zip: "77002", lat: 29.756845, lng: -95.365652 };
    const picked = chooseBaseZip([houston, neighbor, conroe]);
    expect(picked).not.toBeNull();
    const base = [houston, neighbor, conroe].find((point) => point.zip === picked?.zip);
    expect(base).toBeTruthy();
    for (const point of [houston, neighbor, conroe]) {
      const miles = haversineMiles(base!.lat, base!.lng, point.lat, point.lng) ?? 0;
      expect(miles).toBeLessThanOrEqual(picked!.radiusMiles);
    }
    expect(picked!.radiusMiles).toBe(sensibleRadiusMiles(picked!.maxMiles));
    expect(haversineMiles(conroe.lat, conroe.lng, houston.lat, houston.lng)!).toBeGreaterThan(25);
    expect(haversineMiles(conroe.lat, conroe.lng, houston.lat, houston.lng)!).toBeLessThan(50);
  });
});
